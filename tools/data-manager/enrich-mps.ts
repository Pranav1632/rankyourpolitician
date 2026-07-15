/**
 * Data-manager step: ENRICH the existing Lok Sabha roster with real, cited
 * per-member detail from Wikidata (CC0) - so every profile carries facts, not
 * just an identity line. For each MP we resolve their Wikipedia article (linked
 * from the canonical 18th-Lok-Sabha list) to a Wikidata QID, then pull:
 *   - date of birth  -> age            (fact: age)
 *   - occupations    -> profession     (fact: profession)
 *   - educated at    -> education      (fact: education)
 *   - positions held -> terms in the Lok Sabha (fact: terms_served) + notable
 *                       past/other offices (fact: previous_positions)
 *   - image (P18)    -> photo_url + photo_license (from Wikimedia Commons)
 *
 * Every added fact is cited to the member's Wikidata item with today's date.
 * CURATED facts already present for a field are NEVER overwritten (Wikidata only
 * fills gaps). No financial/criminal numbers here - those come from the ECI
 * affidavit importer with their own official source.
 *
 * Usage:  npm run dm -- enrich-mps            (all MPs, live)
 *         ENRICH_LIMIT=20 npm run dm -- enrich-mps   (first 20 - for testing)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const WP_API = 'https://en.wikipedia.org/w/api.php';
const WD_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKI_TITLE = 'List_of_members_of_the_18th_Lok_Sabha';
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);
const LIMIT = process.env.ENRICH_LIMIT ? parseInt(process.env.ENRICH_LIMIT, 10) : Infinity;

async function api(base: string, params: Record<string, string>): Promise<any> {
  const u = base + '?format=json&formatversion=2&origin=*&' + new URLSearchParams(params);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (attempt === 4) throw e;
    }
    await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
  }
}

// ---- 1. Parse the list page, capturing each seat's constituency + article title ----
const SEC2CODE: Record<string, string> = {
  'Andaman and Nicobar Islands': 'AN', 'Andhra Pradesh': 'AP', 'Arunachal Pradesh': 'AR', Assam: 'AS', Bihar: 'BR',
  Chandigarh: 'CH', Chhattisgarh: 'CG', 'Dadra and Nagar Haveli and Daman and Diu': 'DN', Delhi: 'DL', Goa: 'GA',
  Gujarat: 'GJ', Haryana: 'HR', 'Himachal Pradesh': 'HP', 'Jammu and Kashmir': 'JK', Jharkhand: 'JH', Karnataka: 'KA',
  Kerala: 'KL', Ladakh: 'LA', Lakshadweep: 'LD', 'Madhya Pradesh': 'MP', Maharashtra: 'MH', Manipur: 'MN',
  Meghalaya: 'ML', Mizoram: 'MZ', Nagaland: 'NL', Odisha: 'OD', Puducherry: 'PY', Punjab: 'PB', Rajasthan: 'RJ',
  Sikkim: 'SK', 'Tamil Nadu': 'TN', Telangana: 'TG', Tripura: 'TR', 'Uttar Pradesh': 'UP', Uttarakhand: 'UK', 'West Bengal': 'WB',
};
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const clean = (s: string) => s.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\s+/g, ' ').trim();
const cellsOf = (row: string) => ('\n' + row).split(/\n\s*[|!]\s?/).map((c) => c.trim()).filter((c) => c.length);
function titleFrom(cell: string | undefined): string | null {
  if (!cell || /vacant/i.test(cell)) return null;
  const m = cell.match(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/);
  return m ? m[1].trim().replace(/_/g, ' ') : null;
}

interface Seat { constituencyId: string; title: string | null; }
function parseSeats(wt: string): Seat[] {
  const parts = wt.split(/^==\s*(.+?)\s*==\s*$/m);
  const out: Seat[] = [];
  for (let s = 1; s < parts.length; s += 2) {
    const code = SEC2CODE[clean(parts[s])];
    if (!code) continue;
    const rows = (parts[s + 1] || '').split(/\n\|-/);
    for (let i = 0; i < rows.length; i++) {
      const cm = rows[i].match(/(?:rowspan\s*=\s*"?(\d+)"?\s*\|\s*)?\[\[([^\]|]*) Lok Sabha constituency(?:\|([^\]]+))?\]\]/);
      if (!cm) continue;
      const arr = cellsOf(rows[i]);
      const ci = arr.findIndex((c) => / Lok Sabha constituency/.test(c));
      if (ci < 0) continue;
      const cons = clean(cm[3] || cm[2]).replace(/\s*\((SC|ST)\)\s*$/i, '').trim();
      const span = cm[1] ? parseInt(cm[1], 10) : 1;
      let title = titleFrom(arr[ci + 1]);
      for (let k = 1; k < span; k++) { const t = titleFrom(cellsOf(rows[i + k] || '')[0]); if (t) title = t; }
      i += span - 1;
      out.push({ constituencyId: `pc-${code.toLowerCase()}-${slug(cons)}`, title });
    }
  }
  return out;
}

// ---- 2. Resolve article titles -> QIDs (Wikipedia pageprops) ----
async function titlesToQids(titles: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const jr = await api(WP_API, { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', titles: batch.join('|'), redirects: '1' });
    const norm = new Map<string, string>((jr.query.normalized || []).map((n: any) => [n.from, n.to]));
    const redir = new Map<string, string>((jr.query.redirects || []).map((r: any) => [r.from, r.to]));
    const byTitle = new Map<string, string>((jr.query.pages || []).map((p: any) => [p.title, p.pageprops?.wikibase_item]));
    for (const t of batch) { let k = norm.get(t) || t; k = redir.get(k) || k; const q = byTitle.get(k); if (q) map.set(t, q); }
  }
  return map;
}

// ---- 3. Fetch Wikidata entities ----
type Entity = any;
async function getEntities(qids: string[]): Promise<Map<string, Entity>> {
  const map = new Map<string, Entity>();
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const jr = await api(WD_API, { action: 'wbgetentities', ids: batch.join('|'), props: 'claims|labels', languages: 'en' });
    for (const [id, ent] of Object.entries(jr.entities || {})) map.set(id, ent);
  }
  return map;
}
async function getLabels(qids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(qids)];
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    const jr = await api(WD_API, { action: 'wbgetentities', ids: batch.join('|'), props: 'labels', languages: 'en' });
    for (const [id, ent] of Object.entries<any>(jr.entities || {})) if (ent.labels?.en) map.set(id, ent.labels.en.value);
  }
  return map;
}

// ---- Claim helpers ----
const claims = (e: Entity, p: string): any[] => (e?.claims?.[p] || []).filter((s: any) => s.mainsnak?.datavalue);
const itemIds = (e: Entity, p: string): string[] => claims(e, p).map((s) => s.mainsnak.datavalue.value.id);
function firstTime(e: Entity, p: string): string | null {
  const s = claims(e, p)[0];
  return s ? s.mainsnak.datavalue.value.time : null; // "+1963-04-03T00:00:00Z"
}
function qualTimeYear(st: any, p: string): string | null {
  const q = st.qualifiers?.[p]?.[0]?.datavalue?.value?.time;
  return q ? q.slice(1, 5) : null;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function fmtDob(time: string): { display: string; age: number | null } | null {
  const m = time.match(/^\+(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [_, y, mo, d] = m;
  const year = +y, mon = +mo, day = +d;
  let display = y as string;
  if (mon > 0 && day > 0) display = `${day} ${MONTHS[mon - 1]} ${y}`;
  else if (mon > 0) display = `${MONTHS[mon - 1]} ${y}`;
  const today = new Date(TODAY);
  let age: number | null = null;
  if (year > 1900) {
    age = today.getFullYear() - year;
    const beforeBirthday = mon > 0 && (today.getMonth() + 1 < mon || (today.getMonth() + 1 === mon && day > 0 && today.getDate() < day));
    if (beforeBirthday) age--;
  }
  return { display, age };
}

async function main() {
  console.log('Fetching the 18th Lok Sabha list…');
  const wt = (await api(WP_API, { action: 'parse', page: WIKI_TITLE, prop: 'wikitext' })).parse.wikitext as string;
  let seats = parseSeats(wt).filter((s) => s.title);
  if (LIMIT !== Infinity) seats = seats.slice(0, LIMIT);
  console.log(`Seats with an article: ${seats.length}. Resolving QIDs…`);

  const title2qid = await titlesToQids([...new Set(seats.map((s) => s.title!))]);
  const consToQid = new Map<string, string>();
  for (const s of seats) { const q = title2qid.get(s.title!); if (q) consToQid.set(s.constituencyId, q); }
  // Enrich LS MPs (matched by constituency) AND any record already carrying a
  // wikidata_qid (e.g. Rajya Sabha members imported by import-rajya-sabha).
  const pols: Politician[] = JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8'));
  const byCons = new Map(pols.map((p) => [p.constituencyId, p]));
  const qidByPol = new Map<string, string>();
  // ENRICH_ONLY_NEW=1 restricts to records that carry no facts and no photo yet
  // (e.g. a freshly-imported tier) so we don't re-fetch thousands already enriched.
  const onlyNew = process.env.ENRICH_ONLY_NEW === '1';
  const needs = (p: Politician) => !onlyNew || (p.facts.length === 0 && !p.photo_url);
  for (const [cid, qid] of consToQid) { const p = byCons.get(cid); if (p && needs(p)) qidByPol.set(p.id, qid); }
  for (const p of pols) if (p.wikidata_qid && !qidByPol.has(p.id) && needs(p)) qidByPol.set(p.id, p.wikidata_qid);
  const qids = [...new Set([...qidByPol.values()])];
  console.log(`Enriching ${qidByPol.size} records (${qids.length} unique QIDs). Fetching Wikidata entities…`);
  const entities = await getEntities(qids);

  // Second pass: resolve labels for all referenced occupation/education/position items.
  const refIds: string[] = [];
  for (const e of entities.values()) { refIds.push(...itemIds(e, 'P106'), ...itemIds(e, 'P69'), ...itemIds(e, 'P39')); }
  console.log(`Resolving ${new Set(refIds).size} referenced labels…`);
  const labels = await getLabels(refIds);
  const lab = (id: string) => labels.get(id) || null;

  // Collect Commons image filenames to fetch licenses in one batch.
  const fileByQid = new Map<string, string>();
  for (const [q, e] of entities) { const f = claims(e, 'P18')[0]?.mainsnak?.datavalue?.value; if (f) fileByQid.set(q, f as string); }
  const files = [...new Set(fileByQid.values())].map((f) => `File:${f}`);
  const license = new Map<string, string>();
  for (let i = 0; i < files.length; i += 50) {
    const jr = await api(COMMONS_API, { action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', titles: files.slice(i, i + 50).join('|') });
    for (const p of jr.query?.pages || []) {
      const lic = p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value;
      if (lic) license.set(p.title.replace(/^File:/, ''), lic);
    }
  }

  // ---- Build a Wikidata fact set per constituency ----
  function buildFacts(qid: string): { facts: Fact[]; terms: number | null; photo?: { url: string; license: string } } {
    const e = entities.get(qid);
    const src = `https://www.wikidata.org/wiki/${qid}`;
    const cite = { source_url: src, source_name: 'Wikidata', retrieved_date: TODAY };
    const facts: Fact[] = [];

    const dobTime = firstTime(e, 'P569');
    if (dobTime) {
      const d = fmtDob(dobTime);
      if (d) facts.push({ field_type: 'age', value: d.age != null ? `Born ${d.display} (age ${d.age})` : `Born ${d.display}`, ...cite });
    }
    const occ = itemIds(e, 'P106').map(lab).filter(Boolean) as string[];
    // Lead with non-"politician" occupations (more informative), keep politician last.
    const occOrdered = [...occ.filter((o) => !/^politician$/i.test(o)), ...occ.filter((o) => /^politician$/i.test(o))];
    if (occOrdered.length) facts.push({ field_type: 'profession', value: [...new Set(occOrdered)].slice(0, 4).join(', '), ...cite });

    const edu = [...new Set(itemIds(e, 'P69').map(lab).filter(Boolean) as string[])];
    if (edu.length) facts.push({ field_type: 'education', value: edu.slice(0, 3).join('; '), ...cite });

    // Positions held (P39): count Lok Sabha terms; list notable other offices.
    const posStmts = claims(e, 'P39');
    let terms = 0;
    const others: { label: string; from: string | null; to: string | null }[] = [];
    for (const st of posStmts) {
      const id = st.mainsnak.datavalue.value.id;
      const label = lab(id);
      if (!label) continue;
      if (/\bLok Sabha\b/i.test(label)) { terms++; continue; }
      others.push({ label, from: qualTimeYear(st, 'P580'), to: qualTimeYear(st, 'P582') });
    }
    if (terms > 0) facts.push({ field_type: 'terms_served', value: String(terms), ...cite });
    // Notable prior/other offices (dedupe by label; show a compact list with years).
    const seen = new Set<string>();
    const prev = others.filter((o) => { if (seen.has(o.label)) return false; seen.add(o.label); return true; })
      .map((o) => (o.from ? `${o.label} (${o.from}${o.to && o.to !== o.from ? `-${o.to}` : o.to ? '' : '-present'})` : o.label))
      .slice(0, 6);
    if (prev.length) facts.push({ field_type: 'previous_positions', value: prev.join('; '), ...cite });

    const file = fileByQid.get(qid);
    const photo = file ? { url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=400`, license: `${license.get(file) || 'See Wikimedia Commons'} · Wikimedia Commons` } : undefined;
    return { facts, terms: terms || null, photo };
  }

  // ---- Merge into the seed (Wikidata only FILLS gaps; curated facts win) ----
  const polById = new Map(pols.map((p) => [p.id, p]));
  let enriched = 0, factsAdded = 0, photos = 0;
  const missing: string[] = [];

  for (const [polId, qid] of qidByPol) {
    const p = polById.get(polId);
    if (!p) continue;
    const { facts, terms, photo } = buildFacts(qid);
    if (!facts.length && !photo) { missing.push(p.name); continue; }
    const have = new Set(p.facts.map((f) => f.field_type));
    for (const f of facts) if (!have.has(f.field_type)) { p.facts.push(f); factsAdded++; }
    if (terms != null && p.terms_served == null) p.terms_served = terms;
    if (photo && !p.photo_url) { p.photo_url = photo.url; p.photo_license = photo.license; photos++; }
    if (!p.wikidata_qid) p.wikidata_qid = qid;
    enriched++;
  }

  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(pols, null, 2) + '\n');
  console.log(`\n✓ Enriched ${enriched} MPs - added ${factsAdded} facts, ${photos} photos.`);
  if (missing.length) console.log(`ℹ No Wikidata detail for ${missing.length}: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`);
  console.log('\nNext: npm run dm -- validate   then   npm run dm -- publish');
}

main().catch((e) => { console.error(e); process.exit(1); });
