/**
 * Data-manager step: add the MLCs - sitting members of the state LEGISLATIVE
 * COUNCILS (Vidhan Parishad), the upper house of a state legislature. Only six
 * states have a Council: Andhra Pradesh, Bihar, Karnataka, Maharashtra,
 * Telangana and Uttar Pradesh (Article 168). ~426 seats in total.
 *
 * MLCs are NOT elected by the general public from a territorial seat: about a
 * third by the state's MLAs, a third by local-body members, a twelfth each by
 * registered graduates and teachers, and the rest nominated by the Governor
 * (Article 171). So - exactly like a Rajya Sabha member - an MLC carries a state
 * and an electorate ("MLA quota" / "… Local Authorities" / "… Graduates" /
 * "… Teachers" / "Nominated") but NO constituencyId.
 *
 * Source: each council's Wikipedia "List of members of the … Legislative
 * Council". Some of those pages are chronological (they also list past members),
 * so we keep only rows whose six-year term is *currently* running
 * (term start ≤ today < term end) - the rigorous test for a sitting member.
 *
 * Identity-only here (name, party, state, electorate, term); bio/photo come from
 * the shared Wikidata enrichment (`enrich-mps`, which enriches any record that
 * carries a wikidata_qid).
 *
 * Usage:  npm run dm -- import-mlcs
 *         MLC_ONE=UP   npm run dm -- import-mlcs   (test a single council)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Constituency } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const WP_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);
const TODAY_MS = Date.now();

const CODE2STATE: Record<string, string> = {
  AP: 'Andhra Pradesh', BR: 'Bihar', KA: 'Karnataka', MH: 'Maharashtra', TG: 'Telangana', UP: 'Uttar Pradesh',
};
// Wikipedia roster page per council.
const PAGE: Record<string, string> = {
  AP: 'List of members of the Andhra Pradesh Legislative Council',
  BR: 'List of members of the Bihar Legislative Council',
  KA: 'List of members of the Karnataka Legislative Council',
  MH: 'List of members of the Maharashtra Legislative Council',
  TG: 'List of members of the Telangana Legislative Council',
  UP: 'List of members of the Uttar Pradesh Legislative Council',
};
// Sanctioned strength of each Council - a structural check against parse drift.
const EXPECTED: Record<string, number> = { AP: 58, BR: 75, KA: 75, MH: 78, TG: 40, UP: 100 };

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stripRefs = (s: string) => s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '').replace(/\{\{efn[^}]*\}\}/gi, '');
const clean = (s: string) => stripRefs(s)
  .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/\*+\s*$/, '').replace(/\s+/g, ' ').trim();
const normParty = (p: string) => clean(p).replace(/\s*\((?:19|20)\d\d[--](?:present|\d\d\d\d)\)\s*$/i, '').trim();

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DATE_G = /(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{4})/g;
const DATE_T = /(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{4})/;
function toMs(m: RegExpMatchArray): number | null {
  const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (mo == null) return null;
  const ms = Date.UTC(+m[3], mo, +m[1]);
  return Number.isNaN(ms) ? null : ms;
}
const isAttr = (c: string) => c === '' || /^(style|class|colspan|rowspan|scope|align|valign|bgcolor|width)\b/i.test(c);
// Wikilinks that are a party / house / place, not a member name.
const NOT_A_NAME = /Legislative (Assembly|Council)|Vidhan|party|Independent politician|File:|\.svg|\.png|\.jpg|List of|Bharatiya Janata|Indian National Congress|Samajwadi|Bahujan|Nationalist|Shiv Sena|Rashtriya|Janata Dal/i;
// Words marking a plain [[wikilink]] as a political party (states like Karnataka
// give the party as a plain link, not a {{party colour}} template).
const PARTY_HINT = /\b(Party|Congress|Sena|Dal|Samajwadi|Bahujan|Janata|Communist|Morcha|Kazhagam|Rashtriya|Biju|Desam|Nationalist|People's|Democratic|Republican|Majlis|Samithi|Vikas|Front|Loktantrik|Soneylal)\b/i;
// Common party abbreviations used as the link text/target (e.g. Karnataka's [[BJP]]).
const ABBR: Record<string, string> = {
  BJP: 'Bharatiya Janata Party', INC: 'Indian National Congress', 'JD(S)': 'Janata Dal (Secular)',
  JDS: 'Janata Dal (Secular)', 'JD(U)': 'Janata Dal (United)', JDU: 'Janata Dal (United)',
  NCP: 'Nationalist Congress Party', RJD: 'Rashtriya Janata Dal', SP: 'Samajwadi Party',
  BSP: 'Bahujan Samaj Party', BRS: 'Bharat Rashtra Samithi', TRS: 'Bharat Rashtra Samithi',
  YSRCP: 'YSR Congress Party', TDP: 'Telugu Desam Party', SHS: 'Shiv Sena', 'SHS(UBT)': 'Shiv Sena (UBT)',
  RLD: 'Rashtriya Lok Dal', AAP: 'Aam Aadmi Party', IND: 'Independent',
};
/** Final tidy of a party value: fold "Ind"/"Independent (politician)" → Independent
 *  and expand any bare abbreviation that slipped through to its full name. */
function finalParty(p: string): string {
  const v = clean(p || '').trim();
  if (!v) return 'Independent';
  if (/^(ind|independent(\b.*)?)$/i.test(v)) return 'Independent';
  return ABBR[v.toUpperCase()] || v;
}
/** Normalise a plain party wikilink/text cell to a full party name, or null. */
function partyFromCell(cell: string): string | null {
  const lm = cell.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
  const target = lm ? lm[1].trim() : clean(cell);
  const disp = lm ? clean(lm[2] || lm[1]) : clean(cell);
  if (!target && !disp) return null;
  if (/independent/i.test(target) || /^ind$/i.test(disp)) return 'Independent';
  if (/Legislative|Vidhan|constituency|Lok Sabha|List of|File:/i.test(target)) return null;
  if (PARTY_HINT.test(target)) return normParty(target);
  const ab = ABBR[disp.toUpperCase()] || ABBR[target.toUpperCase()];
  if (ab) return ab;
  if (PARTY_HINT.test(disp)) return normParty(disp);
  return null;
}

async function api(params: Record<string, string>): Promise<any> {
  const u = WP_API + '?format=json&formatversion=2&origin=*&' + new URLSearchParams(params);
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 800 * (a + 1)));
  }
  throw new Error('API failed: ' + u);
}

interface MLC { code: string; name: string; title: string | null; party: string; electorate: string; termStart: string; termEnd: string; }

/** The section that actually holds the members table (most date-rows), never References. */
function membersBody(wt: string): string {
  const parts = wt.split(/^==+\s*(.+?)\s*==+\s*$/m);
  if (parts.length < 3) return wt;
  let best = '', bestN = 0;
  for (let i = 1; i < parts.length; i += 2) {
    if (/reference|external link|see also|notes/i.test(parts[i])) continue;
    const body = parts[i + 1] || '';
    const n = (body.match(DATE_G) || []).length;
    if (n > bestN) { bestN = n; best = body; }
  }
  return best || wt;
}

/** Split a wikitable row into its cell strings (keeps position; drops non-cell lines). */
function rowCells(row: string): string[] {
  const out: string[] = [];
  for (const line of row.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || t.startsWith('|-') || t.startsWith('|+') || t.startsWith('|}')) continue;
    // A cell line can be `| content` or `| attr="…" | content` - strip a leading
    // attribute prefix (…" |) so the returned string is the cell's real content.
    let c = t.replace(/^\|+/, '');
    c = c.replace(/^\s*[a-z-]+="[^"]*"\s*\|(?!\|)/i, ''); // drop one leading attr="…" | prefix
    out.push(c.trim());
  }
  return out;
}

/** A human phrase for the electorate/quota an MLC seat represents. */
function electorateOf(raw: string): string {
  const s = clean(raw);
  const u = s.toUpperCase();
  if (!s) return 'the Legislative Council';
  if (/^MLA'?S?$/.test(u) || /MLA QUOTA|MLA'S/i.test(s)) return "the state's MLAs (MLA quota)";
  if (/^NOM/i.test(u) || /NOMINAT/i.test(u)) return 'the Governor (nominated member)';
  const tail = u.match(/\b(LA|GR|TR|TA)\s*$/);
  const region = s.replace(/\s*\b(LA|GR|TR|TA)\s*$/i, '').replace(/\s*\(.*?\)\s*$/, '').trim();
  if (tail) {
    const kind = tail[1] === 'LA' ? 'Local Authorities' : tail[1] === 'GR' ? 'Graduates' : 'Teachers';
    return region ? `the ${region} ${kind} constituency` : `a ${kind} constituency`;
  }
  if (/local authorit/i.test(s)) return `the ${s}`;
  if (/graduat/i.test(s)) return `the ${s} constituency`;
  if (/teacher/i.test(s)) return `the ${s} constituency`;
  return `the ${s} seat`;
}

function parseMembers(wt: string, code: string): MLC[] {
  const rows = membersBody(wt).split(/\n\|-/);
  const out: MLC[] = [];
  let curParty = '';
  for (const row of rows) {
    const r = stripRefs(row);
    // Term dates: the row must carry a start AND an end (six-year term).
    const dm = [...r.matchAll(DATE_G)];
    if (dm.length < 2) continue;
    const startMs = toMs(dm[0]);
    const endMs = toMs(dm[1]);
    if (startMs == null || endMs == null) continue;
    // Keep ONLY currently-sitting members: term running as of today.
    if (!(startMs <= TODAY_MS && TODAY_MS < endMs)) continue;

    const cells = rowCells(r);
    const dateIdx = cells.findIndex((c) => DATE_T.test(c));

    // Electorate/quota = the last real cell before the first date cell.
    let electorate = '', electorateIdx = -1;
    for (let i = dateIdx - 1; i >= 0; i--) { if (!isAttr(cells[i])) { const c = clean(cells[i]); if (c && !DATE_T.test(c)) { electorate = c; electorateIdx = i; break; } } }

    // Party - priority: (1) {{party (name with) colo(u)r|X}} template, then
    // (2) a plain party wikilink in the party cell (between name and electorate;
    // Karnataka gives one rowspanned template then plain [[BJP]]-style links).
    // A rowspan-continuation row has NO party cell → curParty carries forward.
    let rp: string | null = null;
    let pm = r.match(/[Pp]arty name with colou?r\s*\|\s*([^|}\n]+)/);
    if (pm) rp = normParty(pm[1]);
    if (!rp) { pm = r.match(/party colou?r\s*\|\s*([^|}\n]+)/i); if (pm) rp = normParty(pm[1]); }
    if (!rp && electorateIdx > 1) {
      for (let i = 1; i < electorateIdx; i++) { if (isAttr(cells[i])) continue; const cp = partyFromCell(cells[i]); if (cp) { rp = cp; break; } }
    }
    if (rp) curParty = rp;

    // Member name = first content cell that isn't an attribute, a date, or a party/house link.
    let name: string | null = null, title: string | null = null;
    for (const c of cells) {
      if (isAttr(c) || DATE_T.test(c)) continue;
      const lm = c.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
      const cand = lm ? clean(lm[2] || lm[1]) : clean(c);
      if (!cand || !/[A-Za-z]/.test(cand) || cand.length < 2 || cand.length > 60) continue;
      if (/^(vacant|resigned|deceased|died|expired|nominated|disqualified)$/i.test(cand)) { name = ''; break; }
      if (lm && NOT_A_NAME.test(lm[1])) continue;
      name = cand;
      title = lm && !NOT_A_NAME.test(lm[1]) ? lm[1].trim().replace(/_/g, ' ') : null;
      break;
    }
    if (!name) continue;

    out.push({
      code, name, title, party: finalParty(curParty), electorate,
      termStart: clean(dm[0][0]), termEnd: clean(dm[1][0]),
    });
  }
  return out;
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

async function main() {
  const only = process.env.MLC_ONE ? process.env.MLC_ONE.split(',').map((s) => s.trim().toUpperCase()) : null;
  const codes = Object.keys(PAGE).filter((c) => !only || only.includes(c));

  const pols: Politician[] = existsSync(resolve(SEED_DIR, 'politicians.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8')) : [];
  const cons: Constituency[] = existsSync(resolve(SEED_DIR, 'constituencies.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'constituencies.json'), 'utf8')) : [];

  // Drop any previously-generated MLC records so a re-run is clean.
  const kept = pols.filter((p) => !(p.house === 'Vidhan Parishad' && p.generated));
  const existingIds = new Set(kept.map((p) => p.id));

  let totalAdded = 0;
  const report: string[] = [];
  for (const code of codes) {
    const state = CODE2STATE[code];
    let wt = '';
    try { wt = (await api({ action: 'parse', page: PAGE[code], prop: 'wikitext', redirects: '1' })).parse.wikitext; }
    catch { report.push(`${code}: FETCH FAILED (${PAGE[code]})`); continue; }
    const members = parseMembers(wt, code);
    const exp = EXPECTED[code];
    const flag = exp ? (members.length > exp + 3 ? ' ⚠OVER' : members.length < exp * 0.75 ? ' ⚠LOW' : '') : '';
    report.push(`${code}: ${members.length}/${exp} sitting${flag}`);

    const t2q = await titlesToQids([...new Set(members.filter((m) => m.title).map((m) => m.title!))]);
    for (const m of members) {
      let id = slug(`${m.name}-mlc-${code}`);
      if (existingIds.has(id)) { let n = 2; while (existingIds.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
      existingIds.add(id);
      const qid = m.title ? t2q.get(m.title) : undefined;
      const via = electorateOf(m.electorate);
      const elected = /Governor/.test(via) ? `nominated to the Council by ${via}` : `elected to the Council by ${via}`;
      kept.push({
        id,
        name: m.name,
        party: m.party,
        house: 'Vidhan Parishad',
        state,
        stateCode: code,
        constituencyId: '',
        constituencyName: 'Legislative Council',
        constituencyType: 'MLC',
        districts: [],
        current_position: `Member of the Legislative Council (MLC), ${state}`,
        is_minister: false,
        neutral_summary: `${m.name} is a Member of the Legislative Council (MLC) in ${state} - the Vidhan Parishad, the upper house of the state legislature - ${elected}. Current party affiliation: ${m.party}. Current term: ${m.termStart} to ${m.termEnd}.`,
        metrics: {},
        facts: [],
        active: true,
        generated: true,
        identity_source: { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(PAGE[code].replace(/ /g, '_'))}`, name: `Wikipedia - ${PAGE[code]}`, retrieved_date: TODAY },
        ...(qid ? { wikidata_qid: qid } : {}),
      });
      totalAdded++;
    }
    await new Promise((res) => setTimeout(res, 400)); // be polite to the API
  }

  kept.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(kept, null, 2) + '\n');
  writeFileSync(resolve(SEED_DIR, 'constituencies.json'), JSON.stringify(cons, null, 2) + '\n'); // unchanged (MLCs have no territorial seat)

  console.log('Per-council MLC parse (sitting members only):');
  for (const r of report) console.log('  ' + r);
  console.log(`\n✓ Added ${totalAdded} MLCs. Total politicians: ${kept.length}.`);
  console.log('Next: npm run dm -- enrich-mps   then   validate');
}

main().catch((e) => { console.error(e); process.exit(1); });
