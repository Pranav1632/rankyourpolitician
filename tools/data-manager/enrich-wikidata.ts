/**
 * Data-manager step: GENERAL Wikidata enrichment for EVERY politician tier —
 * MPs, Rajya Sabha, MLAs and MLCs alike (enrich-mps only covered the Lok Sabha).
 *
 * Two jobs:
 *   1. RESOLVE a Wikidata QID for records that carry none, by searching Wikidata
 *      for the name and disambiguating conservatively — a candidate is accepted
 *      only if it is a human, tied to India, a politician / legislature member,
 *      and carries at least one strong signal (matching constituency, home state,
 *      house, or party). Ambiguous or weak matches are LEFT BLANK (an honest gap
 *      beats a wrong person). Every decision is logged.
 *   2. ENRICH every QID-bearing record from Wikidata (CC0), filling gaps only:
 *        - date of birth   -> age
 *        - occupations     -> profession
 *        - educated at     -> education
 *        - positions held  -> terms in THIS house + notable other offices
 *        - image (P18)     -> photo_url + license (Wikimedia Commons)
 *      When Wikidata has no P18, fall back to the member's English-Wikipedia lead
 *      image, but ONLY if that file lives on Commons (i.e. is freely licensed).
 *
 * Curated facts are NEVER overwritten. No financial/criminal numbers are added
 * here — those come only from the ECI-affidavit importer with their own source.
 * Every added fact is cited to the member's Wikidata item with today's date.
 *
 * Usage:  npm run dm -- enrich-wikidata
 *         ENRICH_LIMIT=50 npm run dm -- enrich-wikidata     (first 50 — testing)
 *         ENRICH_NO_RESOLVE=1 npm run dm -- enrich-wikidata (skip QID search)
 *         ENRICH_NO_PHOTO=1   npm run dm -- enrich-wikidata (skip WP image fallback)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact, House } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const WD_API = 'https://www.wikidata.org/w/api.php';
const WP_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);
const LIMIT = process.env.ENRICH_LIMIT ? parseInt(process.env.ENRICH_LIMIT, 10) : Infinity;
const NO_RESOLVE = process.env.ENRICH_NO_RESOLVE === '1';
const NO_PHOTO = process.env.ENRICH_NO_PHOTO === '1';

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
    await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
  }
}

// ---- Wikidata fetch helpers ----
type Entity = any;
async function getEntities(qids: string[], props = 'claims|labels|sitelinks'): Promise<Map<string, Entity>> {
  const map = new Map<string, Entity>();
  const uniq = [...new Set(qids)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    try {
      const jr = await api(WD_API, { action: 'wbgetentities', ids: batch.join('|'), props, languages: 'en' });
      for (const [id, ent] of Object.entries(jr.entities || {})) map.set(id, ent);
    } catch (e) {
      console.warn(`  ! entity batch ${i} failed: ${(e as Error).message}`);
    }
  }
  return map;
}
async function getLabels(qids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(qids)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    try {
      const jr = await api(WD_API, { action: 'wbgetentities', ids: batch.join('|'), props: 'labels', languages: 'en' });
      for (const [id, ent] of Object.entries<any>(jr.entities || {})) if (ent.labels?.en) map.set(id, ent.labels.en.value);
    } catch { /* skip batch */ }
  }
  return map;
}

const claims = (e: Entity, p: string): any[] => (e?.claims?.[p] || []).filter((s: any) => s.mainsnak?.datavalue);
const itemIds = (e: Entity, p: string): string[] =>
  claims(e, p).map((s) => s.mainsnak.datavalue.value?.id).filter(Boolean);
function firstTime(e: Entity, p: string): string | null {
  const s = claims(e, p)[0];
  return s ? s.mainsnak.datavalue.value.time : null;
}
function qualTimeYear(st: any, p: string): string | null {
  const q = st.qualifiers?.[p]?.[0]?.datavalue?.value?.time;
  return q ? q.slice(1, 5) : null;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function fmtDob(time: string): { display: string; age: number | null } | null {
  const m = time.match(/^\+(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = +y, mon = +mo, day = +d;
  let display: string = y;
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

// ---- normalisation for fuzzy matching ----
const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s: string) => norm(s).replace(/ /g, '');

// Which P39 "position held" labels count as a term in THIS member's house.
const HOUSE_RE: Record<House, RegExp> = {
  'Lok Sabha': /lok sabha|member of parliament, lok sabha/i,
  'Rajya Sabha': /rajya sabha/i,
  'Vidhan Sabha': /legislative assembly|vidhan sabha/i,
  'Vidhan Parishad': /legislative council|vidhan parishad/i,
};
const ANY_LEGISLATURE = /lok sabha|rajya sabha|legislative assembly|legislative council|vidhan sabha|vidhan parishad|member of parliament/i;

const WD = 'Q668'; // India
const Q_HUMAN = 'Q5';
const Q_POLITICIAN = 'Q82955';

interface Enrichment { facts: Fact[]; terms: number | null; photo?: { url: string; license: string }; qid: string }

async function main() {
  const pols: Politician[] = JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8'));
  let working = pols;
  if (LIMIT !== Infinity) working = pols.slice(0, LIMIT);

  // polId -> qid we will enrich from. Start with records that already carry one.
  const qidByPol = new Map<string, string>();
  for (const p of working) if (p.wikidata_qid) qidByPol.set(p.id, p.wikidata_qid);

  // ---- 1. Resolve QIDs for records that have none ----
  const noQid = working.filter((p) => !p.wikidata_qid);
  const resolveLog: { name: string; state: string; qid: string; score: number; why: string }[] = [];
  const unresolved: string[] = [];
  if (!NO_RESOLVE && noQid.length) {
    console.log(`Resolving QIDs for ${noQid.length} records without one…`);
    // 1a. search each name -> candidate qids
    const candByPol = new Map<string, string[]>();
    const allCand: string[] = [];
    let done = 0;
    for (const p of noQid) {
      try {
        const jr = await api(WD_API, { action: 'wbsearchentities', search: p.name, language: 'en', type: 'item', limit: '6' });
        const ids = (jr.search || []).map((s: any) => s.id);
        candByPol.set(p.id, ids);
        allCand.push(...ids);
      } catch { candByPol.set(p.id, []); }
      if (++done % 100 === 0) console.log(`  …searched ${done}/${noQid.length}`);
    }
    // 1b. fetch candidate entities + labels for their referenced items
    console.log(`Fetching ${new Set(allCand).size} candidate entities…`);
    const candEnt = await getEntities(allCand, 'claims|labels');
    const refIds: string[] = [];
    for (const e of candEnt.values()) refIds.push(...itemIds(e, 'P39'), ...itemIds(e, 'P768'), ...itemIds(e, 'P102'));
    const refLab = await getLabels(refIds);
    const lab = (id: string) => refLab.get(id) || '';

    // 1c. score & accept
    for (const p of noQid) {
      const cands = candByPol.get(p.id) || [];
      const nName = compact(p.name);
      const nCons = compact(p.constituencyName || '');
      const nState = norm(p.state || '');
      const nParty = norm(p.party || '');
      const scored: { qid: string; score: number; why: string[] }[] = [];
      for (const qid of cands) {
        const e = candEnt.get(qid);
        if (!e) continue;
        if (!itemIds(e, 'P31').includes(Q_HUMAN)) continue; // must be a person
        const label = e.labels?.en?.value || '';
        // name must genuinely match (search can return loose hits)
        if (compact(label) && nName && !(compact(label).includes(nName) || nName.includes(compact(label)))) continue;
        const posLabels = itemIds(e, 'P39').map(lab);
        const districtLabels = itemIds(e, 'P768').map(lab);
        const partyLabels = itemIds(e, 'P102').map(lab);
        const isIndian = itemIds(e, 'P27').includes(WD);
        const isPolitician = itemIds(e, 'P106').includes(Q_POLITICIAN);
        const hasLegPos = posLabels.some((l) => ANY_LEGISLATURE.test(l));
        const indianSignal = isIndian || posLabels.concat(districtLabels).some((l) => /india|lok sabha|rajya sabha|legislative/i.test(l));
        if (!indianSignal) continue;              // avoid foreign namesakes
        if (!isPolitician && !hasLegPos) continue; // must be a politician
        const why: string[] = [];
        let score = (isPolitician ? 1 : 0) + (isIndian ? 1 : 0);
        if (nCons && districtLabels.some((l) => compact(l).includes(nCons) || nCons.includes(compact(l)))) { score += 3; why.push('constituency'); }
        if (nState && posLabels.concat(districtLabels).some((l) => norm(l).includes(nState))) { score += 2; why.push('state'); }
        if (posLabels.some((l) => HOUSE_RE[p.house].test(l))) { score += 2; why.push('house'); }
        if (nParty && partyLabels.some((l) => norm(l).includes(nParty) || nParty.includes(norm(l)))) { score += 2; why.push('party'); }
        scored.push({ qid, score, why });
      }
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      const second = scored[1];
      // Need a strong signal (score >= 4) and a clear margin over any runner-up.
      if (best && best.score >= 4 && (!second || best.score - second.score >= 2)) {
        qidByPol.set(p.id, best.qid);
        resolveLog.push({ name: p.name, state: p.state, qid: best.qid, score: best.score, why: best.why.join('+') });
      } else {
        unresolved.push(`${p.name} (${p.state})`);
      }
    }
    console.log(`  resolved ${resolveLog.length}, left ${unresolved.length} unresolved (kept blank).`);
  }

  // ---- 2. Fetch entities for everyone we will enrich ----
  const qids = [...new Set(qidByPol.values())];
  console.log(`Enriching ${qidByPol.size} records (${qids.length} unique QIDs). Fetching entities…`);
  const entities = await getEntities(qids);

  // Resolve labels for referenced occupation / education / position items.
  const refIds: string[] = [];
  for (const e of entities.values()) refIds.push(...itemIds(e, 'P106'), ...itemIds(e, 'P69'), ...itemIds(e, 'P39'));
  console.log(`Resolving ${new Set(refIds).size} referenced labels…`);
  const labels = await getLabels(refIds);
  const lab = (id: string) => labels.get(id) || null;

  // ---- 3. Photos: P18 first, else English-Wikipedia lead image (Commons only) ----
  const fileByQid = new Map<string, string>();
  for (const [q, e] of entities) { const f = claims(e, 'P18')[0]?.mainsnak?.datavalue?.value; if (f) fileByQid.set(q, f as string); }

  if (!NO_PHOTO) {
    // For QID records with no P18 but an enwiki article, look up the page lead image.
    const enTitleByQid = new Map<string, string>();
    for (const [q, e] of entities) {
      if (fileByQid.has(q)) continue;
      const t = e.sitelinks?.enwiki?.title;
      if (t) enTitleByQid.set(q, t);
    }
    const titles = [...enTitleByQid.entries()];
    console.log(`Looking up Wikipedia lead images for ${titles.length} photoless records…`);
    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      try {
        const jr = await api(WP_API, { action: 'query', prop: 'pageimages', piprop: 'name', titles: batch.map(([, t]) => t).join('|'), redirects: '1' });
        const norm2 = new Map<string, string>((jr.query?.normalized || []).map((n: any) => [n.to, n.from]));
        const redir = new Map<string, string>((jr.query?.redirects || []).map((r: any) => [r.to, r.from]));
        const titleToQid = new Map(batch.map(([q, t]) => [t, q]));
        for (const pg of jr.query?.pages || []) {
          const file = pg.pageimage;
          if (!file) continue;
          // map the (possibly normalised/redirected) page title back to its qid
          let key = pg.title;
          key = redir.get(key) || key;
          key = norm2.get(key) || key;
          const qid = titleToQid.get(key);
          if (qid) fileByQid.set(qid, file); // license-gated below (Commons lookup)
        }
      } catch { /* skip batch */ }
    }
  }

  // Batch-fetch Commons licence for every candidate file. Files that are NOT on
  // Commons (e.g. local fair-use uploads) return "missing" and are dropped — so a
  // Wikipedia-lead-image fallback only survives when it is freely licensed.
  const files = [...new Set(fileByQid.values())].map((f) => `File:${f}`);
  const license = new Map<string, string>();
  const onCommons = new Set<string>();
  console.log(`Verifying licences for ${files.length} images on Commons…`);
  for (let i = 0; i < files.length; i += 50) {
    try {
      const jr = await api(COMMONS_API, { action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', titles: files.slice(i, i + 50).join('|') });
      for (const pg of jr.query?.pages || []) {
        if (pg.missing) continue;
        const name = pg.title.replace(/^File:/, '');
        onCommons.add(name);
        const lic = pg.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value;
        if (lic) license.set(name, lic);
      }
    } catch { /* skip batch */ }
  }

  // ---- 4. Build a fact set per QID ----
  function build(qid: string, house: House): Enrichment {
    const e = entities.get(qid);
    const src = `https://www.wikidata.org/wiki/${qid}`;
    const cite = { source_url: src, source_name: 'Wikidata', retrieved_date: TODAY };
    const facts: Fact[] = [];

    const dobTime = firstTime(e, 'P569');
    if (dobTime) {
      const d = fmtDob(dobTime);
      // A sitting legislator cannot be under 21 (the constitutional floor is 25);
      // an age below that — or absurdly high — is a source error, so we drop it
      // rather than propagate an obviously-wrong birth year.
      if (d && (d.age == null || (d.age >= 21 && d.age <= 105))) {
        facts.push({ field_type: 'age', value: d.age != null ? `Born ${d.display} (age ${d.age})` : `Born ${d.display}`, ...cite });
      }
    }
    const occ = itemIds(e, 'P106').map(lab).filter(Boolean) as string[];
    const occOrdered = [...occ.filter((o) => !/^politician$/i.test(o)), ...occ.filter((o) => /^politician$/i.test(o))];
    if (occOrdered.length) facts.push({ field_type: 'profession', value: [...new Set(occOrdered)].slice(0, 4).join(', '), ...cite });

    const edu = [...new Set(itemIds(e, 'P69').map(lab).filter(Boolean) as string[])];
    if (edu.length) facts.push({ field_type: 'education', value: edu.slice(0, 3).join('; '), ...cite });

    // Positions held: count terms in THIS house; list notable other offices.
    const posStmts = claims(e, 'P39');
    let terms = 0;
    const others: { label: string; from: string | null; to: string | null }[] = [];
    for (const st of posStmts) {
      const id = st.mainsnak.datavalue.value.id;
      const label = lab(id);
      if (!label) continue;
      if (HOUSE_RE[house].test(label)) { terms++; continue; }
      others.push({ label, from: qualTimeYear(st, 'P580'), to: qualTimeYear(st, 'P582') });
    }
    if (terms > 0) facts.push({ field_type: 'terms_served', value: String(terms), ...cite });
    const seen = new Set<string>();
    const prev = others.filter((o) => { if (seen.has(o.label)) return false; seen.add(o.label); return true; })
      .map((o) => (o.from ? `${o.label} (${o.from}${o.to && o.to !== o.from ? `–${o.to}` : o.to ? '' : '–present'})` : o.label))
      .slice(0, 6);
    if (prev.length) facts.push({ field_type: 'previous_positions', value: prev.join('; '), ...cite });

    const file = fileByQid.get(qid);
    const photo = file && onCommons.has(file)
      ? { url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=400`, license: `${license.get(file) || 'See Wikimedia Commons'} · Wikimedia Commons` }
      : undefined;
    return { facts, terms: terms || null, photo, qid };
  }

  // ---- 5. Merge (fill gaps only; curated wins) ----
  const polById = new Map(pols.map((p) => [p.id, p]));
  let enriched = 0, factsAdded = 0, photos = 0, qidsSet = 0;
  const nothing: string[] = [];
  for (const [polId, qid] of qidByPol) {
    const p = polById.get(polId);
    if (!p || !entities.get(qid)) continue;
    const { facts, terms, photo } = build(qid, p.house);
    let touched = false;
    if (!p.wikidata_qid) { p.wikidata_qid = qid; qidsSet++; touched = true; }
    const have = new Set(p.facts.map((f) => f.field_type));
    for (const f of facts) if (!have.has(f.field_type)) { p.facts.push(f); factsAdded++; touched = true; }
    if (terms != null && p.terms_served == null) { p.terms_served = terms; touched = true; }
    if (photo && !p.photo_url) { p.photo_url = photo.url; p.photo_license = photo.license; photos++; touched = true; }
    if (touched) enriched++; else if (!facts.length && !photo) nothing.push(p.name);
  }

  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(pols, null, 2) + '\n');

  console.log(`\n✓ Enriched ${enriched} records — +${factsAdded} facts, +${photos} photos, +${qidsSet} newly-linked QIDs.`);
  if (resolveLog.length) {
    console.log(`\nResolved QIDs (${resolveLog.length}) — sample:`);
    for (const r of resolveLog.slice(0, 25)) console.log(`  ${r.name} (${r.state}) -> ${r.qid}  [${r.why}, score ${r.score}]`);
  }
  if (unresolved.length) console.log(`\nℹ Left blank — no confident Wikidata match for ${unresolved.length} (e.g. ${unresolved.slice(0, 8).join('; ')}…)`);
  if (nothing.length) console.log(`\nℹ Wikidata item exists but carries no usable detail for ${nothing.length} records.`);
  console.log('\nNext: npm run dm -- validate   then rebuild indexes + build.');
}

main().catch((e) => { console.error(e); process.exit(1); });
