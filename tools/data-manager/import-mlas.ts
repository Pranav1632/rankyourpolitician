/**
 * Data-manager step: add the MLAs (state Legislative Assembly members) for every
 * state/UT — the ~4,100 elected representatives — from each assembly's current
 * Wikipedia members roster (page titles discovered by the ryp-assembly-pages
 * workflow). Identity-only (name, party, constituency); bio/photo come from the
 * shared Wikidata enrichment. Assembly constituencies (ACs) are added to
 * constituencies.json.
 *
 * Usage:  npx tsx tools/data-manager/import-mlas.ts <discovered-pages.json|.output>
 *         MLA_ONE=MH:15th Maharashtra Assembly   npx tsx ... (test one state)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Constituency } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const WP_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);

const CODE2STATE: Record<string, string> = {
  AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CG: 'Chhattisgarh', GA: 'Goa',
  GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala',
  MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland',
  OD: 'Odisha', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana', TR: 'Tripura',
  UP: 'Uttar Pradesh', UK: 'Uttarakhand', WB: 'West Bengal', DL: 'Delhi', PY: 'Puducherry', JK: 'Jammu & Kashmir',
};
// Known assembly sizes — a structural check against silent parse drift.
const EXPECTED: Record<string, number> = {
  AP: 175, AR: 60, AS: 126, BR: 243, CG: 90, GA: 40, GJ: 182, HR: 90, HP: 68, JH: 81, KA: 224, KL: 140, MP: 230,
  MH: 288, MN: 60, ML: 60, MZ: 40, NL: 60, OD: 147, PB: 117, RJ: 200, SK: 32, TN: 234, TG: 119, TR: 60, UP: 403,
  UK: 70, WB: 294, DL: 70, PY: 30, JK: 90,
};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stripRefs = (s: string) => s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '').replace(/\{\{efn[^}]*\}\}/gi, '');
const clean = (s: string) => stripRefs(s)
  .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ').trim();
const normParty = (p: string) => clean(p).replace(/\s*\((?:19|20)\d\d[–-](?:present|\d\d\d\d)\)\s*$/i, '').trim();
const cellsOf = (row: string) => ('\n' + row).split(/\n\s*[|!]\s?/).map((c) => c.trim()).filter((c) => c.length);
const EXCLUDE = /(?:Assembly|Vidhan[a]? Sabha|Legislative) constituency|Lok Sabha| district\b|Party|File:|List of|Chief Minister|Speaker|Deputy Speaker|Governor|\.svg|\.png|\.jpg/i;
// Constituency wikilink in any spelling used across states.
const CONS_RE = /\[\[([^\]|]*?(?:Assembly|Vidhan[a]? Sabha|Legislative Assembly) constituency[^\]|]*?)(?:\|([^\]]+))?\]\]/;
const CONS_COUNT_RE = /(?:Assembly|Vidhan[a]? Sabha|Legislative Assembly) constituency/g;
const ALLIANCE_TAIL = /(?:Alliance|Coalition)$/i;
// Words that mark a wikilink as a political party (for states that link the party
// as a plain [[Party]] rather than a {{Party name with colour}} template, e.g. UP).
const PARTY_HINT = /\b(Party|Congress|Sena|Dal|Samajwadi|Bahujan|Janata|Communist|Morcha|Kazhagam|Rashtriya|Trinamool|Biju|Desam|Nationalist|People's|Democratic|Republican|Majlis|Jana Sena|Apna|Lok|Munnetra|Maha Vikas|Front)\b/i;

async function api(params: Record<string, string>): Promise<any> {
  const u = WP_API + '?format=json&formatversion=2&origin=*&' + new URLSearchParams(params);
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 700 * (a + 1)));
  }
  throw new Error('API failed: ' + u);
}

interface MLA { cons: string; name: string; title: string | null; party: string; }

/** Pick the section with the most Assembly-constituency links (the members table). */
function membersBody(wt: string): string {
  const parts = wt.split(/^==+\s*(.+?)\s*==+\s*$/m);
  if (parts.length < 3) return wt;
  let best = '';
  let bestN = 0;
  for (let i = 1; i < parts.length; i += 2) {
    if (/council/i.test(parts[i])) continue; // skip Legislative Council sections
    const body = parts[i + 1] || '';
    const n = (body.match(CONS_COUNT_RE) || []).length;
    if (n > bestN) { bestN = n; best = body; }
  }
  return best || wt;
}

function parseMembers(wt: string): MLA[] {
  const body = membersBody(wt);
  const rows = body.split(/\n\|-/);
  const out: MLA[] = [];
  let curParty = '';
  for (const row of rows) {
    // Constituency wikilink (any spelling). Prefer the link's display text; else
    // derive it by stripping the "…(Assembly|Vidhan Sabha) constituency" tail.
    const consM = row.match(CONS_RE);
    if (!consM) continue;
    const cons = (consM[2] ? clean(consM[2]) : clean(consM[1].replace(/\s*\(?[A-Za-z. ]*?(?:Assembly|Vidhan[a]? Sabha|Legislative Assembly) constituency\)?/i, '')))
      .replace(/\s*\((SC|ST|SC\/ST)\)\s*$/i, '').trim();
    if (!cons) continue;
    // Party: prefer "Full party name with colour" (the member's own party); else
    // the first "Party name with colour" that isn't an alliance/front column.
    const full = row.match(/Full party name with colou?r\s*\|\s*([^|}\n]+)/i);
    let rowParty: string | null = full ? normParty(full[1]) : null;
    if (!rowParty) {
      for (const m of row.matchAll(/[Pp]arty name with colou?r\s*\|\s*([^|}\n]+)/g)) {
        const v = normParty(m[1]);
        if (v && !ALLIANCE_TAIL.test(v)) { rowParty = v; break; }
      }
    }
    if (!rowParty) { const pc = row.match(/[Pp]arty color\s*\|\s*([^|}\n]+)/); if (pc) rowParty = normParty(pc[1]); }
    const links = [...row.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)];
    // Plain-link party (e.g. UP links [[Samajwadi Party]] instead of a template).
    if (!rowParty) {
      for (const lm of links) {
        const disp = clean(lm[2] || lm[1]);
        if (PARTY_HINT.test(lm[1]) && !ALLIANCE_TAIL.test(disp) && !/constituency|district|Lok Sabha|List of/i.test(lm[1])) { rowParty = normParty(lm[2] || lm[1]); break; }
      }
    }
    if (rowParty) curParty = rowParty;
    // Member = first person wikilink in the row that isn't a constituency/party/etc.
    let title: string | null = null;
    let name: string | null = null;
    for (const lm of links) {
      if (EXCLUDE.test(lm[1]) || PARTY_HINT.test(lm[1])) continue;
      title = lm[1].trim().replace(/_/g, ' ');
      name = clean(lm[2] || lm[1]);
      break;
    }
    if (!name) {
      // plain-text member: the cell right after the constituency cell
      const cells = cellsOf(row);
      const ci = cells.findIndex((c) => /Assembly constituency/.test(c));
      const cand = ci >= 0 ? clean(cells[ci + 1] || '') : '';
      if (cand && /^[A-Za-z]/.test(cand) && cand.length <= 50 && !/^vacant$/i.test(cand)) name = cand;
    }
    if (!name || name.length < 2 || /^vacant$/i.test(name)) continue;
    out.push({ cons, name, title, party: curParty || 'Independent' });
  }
  // Dedup by constituency (keep first) — guards against a stray positions-table row.
  const seen = new Set<string>();
  return out.filter((m) => { const k = slug(m.cons); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function titlesToQids(titles: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const jr = await api({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', titles: batch.join('|'), redirects: '1' });
    const norm = new Map<string, string>((jr.query.normalized || []).map((n: any) => [n.from, n.to]));
    const redir = new Map<string, string>((jr.query.redirects || []).map((r: any) => [r.from, r.to]));
    const byT = new Map<string, string>((jr.query.pages || []).map((p: any) => [p.title, p.pageprops?.wikibase_item]));
    for (const t of batch) { let k = norm.get(t) || t; k = redir.get(k) || k; const q = byT.get(k); if (q) map.set(t, q); }
  }
  return map;
}

interface PageRef { stateCode: string; rosterPageTitle: string; }

async function main() {
  const arg = process.argv[2];
  let pages: PageRef[];
  if (process.env.MLA_ONE) {
    const [stateCode, ...rest] = process.env.MLA_ONE.split(':');
    pages = [{ stateCode, rosterPageTitle: rest.join(':') }];
  } else {
    if (!arg || !existsSync(arg)) { console.error('Usage: import-mlas <discovered-pages.json>'); process.exit(1); }
    const raw = JSON.parse(readFileSync(arg, 'utf8'));
    pages = (raw.pages || raw.result?.pages || raw).filter((p: any) => p.rosterPageTitle && p.exists !== false)
      .map((p: any) => ({ stateCode: p.stateCode, rosterPageTitle: p.rosterPageTitle }));
  }

  const pols: Politician[] = existsSync(resolve(SEED_DIR, 'politicians.json')) ? JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8')) : [];
  const cons: Constituency[] = existsSync(resolve(SEED_DIR, 'constituencies.json')) ? JSON.parse(readFileSync(resolve(SEED_DIR, 'constituencies.json'), 'utf8')) : [];
  // Drop previously-generated MLA records so a re-run is clean (keep LS/RS/curated + PC/RS constituencies).
  let kept = pols.filter((p) => !(p.constituencyType === 'AC' && p.generated));
  const consById = new Map(cons.filter((c) => c.type !== 'AC').map((c) => [c.id, c]));
  const existingIds = new Set(kept.map((p) => p.id));

  let totalAdded = 0;
  const report: string[] = [];
  for (const { stateCode: code, rosterPageTitle } of pages) {
    const state = CODE2STATE[code] || code;
    let wt = '';
    try { wt = (await api({ action: 'parse', page: rosterPageTitle, prop: 'wikitext', redirects: '1' })).parse.wikitext; } catch { report.push(`${code}: FETCH FAILED (${rosterPageTitle})`); continue; }
    const mlas = parseMembers(wt);
    const exp = EXPECTED[code];
    const flag = exp ? (Math.abs(mlas.length - exp) > Math.max(5, exp * 0.08) ? ' ⚠OFF' : '') : '';
    report.push(`${code}: ${mlas.length}${exp ? `/${exp}` : ''}${flag}  (${rosterPageTitle})`);

    // Resolve QIDs for members with an article.
    const t2q = await titlesToQids([...new Set(mlas.filter((m) => m.title).map((m) => m.title!))]);
    for (const m of mlas) {
      const constituencyId = `ac-${code.toLowerCase()}-${slug(m.cons)}`;
      if (!consById.has(constituencyId)) consById.set(constituencyId, { id: constituencyId, type: 'AC', name: m.cons, state, stateCode: code, districts: [] });
      const id = slug(`${m.cons}-ac-${code}-${m.name}`);
      if (existingIds.has(id)) continue;
      existingIds.add(id);
      const qid = m.title ? t2q.get(m.title) : undefined;
      kept.push({
        id, name: m.name, party: m.party, house: 'Vidhan Sabha', state, stateCode: code,
        constituencyId, constituencyName: m.cons, constituencyType: 'AC', districts: [],
        current_position: `Member of the Legislative Assembly, ${state}`,
        is_minister: false,
        neutral_summary: `${m.name} is the Member of the Legislative Assembly (MLA) for the ${m.cons} constituency in ${state}. Current party affiliation: ${m.party}.`,
        metrics: {}, facts: [], active: true, generated: true,
        identity_source: { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(rosterPageTitle.replace(/ /g, '_'))}`, name: `Wikipedia — ${rosterPageTitle} (ECI results)`, retrieved_date: TODAY },
        ...(qid ? { wikidata_qid: qid } : {}),
      });
      totalAdded++;
    }
    await new Promise((res) => setTimeout(res, 400)); // be polite to the API
  }

  const constituencies = [...consById.values()].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  kept.sort((a, b) => a.state.localeCompare(b.state) || a.constituencyName.localeCompare(b.constituencyName));
  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(kept, null, 2) + '\n');
  writeFileSync(resolve(SEED_DIR, 'constituencies.json'), JSON.stringify(constituencies, null, 2) + '\n');

  console.log('Per-state MLA parse:');
  for (const r of report) console.log('  ' + r);
  console.log(`\n✓ Added ${totalAdded} MLAs. Total politicians: ${kept.length}. Constituencies: ${constituencies.length}.`);
  console.log('Next: npm run dm -- enrich-mps   then   validate   then   publish');
}

main().catch((e) => { console.error(e); process.exit(1); });
