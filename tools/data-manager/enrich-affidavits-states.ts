/**
 * Data-manager step: add STATE-ASSEMBLY election-affidavit figures (declared
 * assets, liabilities, pending criminal cases, and declared education level)
 * for sitting MLAs, from MyNeta (ADR) — the official self-sworn affidavits filed
 * with the Election Commission. Shown strictly "as declared"; a declared case is
 * a pending trial, not a conviction (the profile UI states this). Fill-only —
 * never overwrites a curated or Wikidata fact.
 *
 * SAFETY — this is the most sensitive data we hold, so the join is doubly guarded:
 *   1. Per row: the affidavit is applied only when BOTH the constituency key AND
 *      the winner's name match our sitting MLA for that seat (fuzzy). A seat whose
 *      MyNeta winner name doesn't match our member is skipped — never guessed.
 *   2. Per state: before applying anything, we require the MyNeta winner set to
 *      OVERLAP our roster for that state above a threshold. A wrong-election page
 *      (e.g. a superseded assembly, or a mis-guessed slug) overlaps poorly and is
 *      auto-skipped and logged — so correctness never depends on the slug being
 *      the exactly-right election. Only verified states are written.
 *
 * Usage:  npm run dm -- enrich-affidavits-states
 *         AFF_STATES=UP,KA npm run dm -- enrich-affidavits-states   (subset)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const UA = 'Mozilla/5.0 (RankYourPolitician civic-info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);
const MAX_PAGES = 40;
const OVERLAP_MIN = 0.45; // a state page must match at least this share of our seats

// Most-recent (current-seating) state-assembly election on MyNeta, per state.
// Several candidate slugs are tried in order — MyNeta's naming isn't uniform —
// and the name-overlap guard rejects any that turns out to be the wrong election.
const SLUGS: Record<string, { year: string; slugs: string[] }> = {
  UP: { year: '2022', slugs: ['uttarpradesh2022'] },
  PB: { year: '2022', slugs: ['punjab2022'] },
  UK: { year: '2022', slugs: ['uttarakhand2022'] },
  GA: { year: '2022', slugs: ['goa2022'] },
  MN: { year: '2022', slugs: ['manipur2022'] },
  GJ: { year: '2022', slugs: ['gujarat2022'] },
  HP: { year: '2022', slugs: ['himachalpradesh2022', 'himachal2022'] },
  KA: { year: '2023', slugs: ['karnataka2023'] },
  TG: { year: '2023', slugs: ['telangana2023'] },
  MP: { year: '2023', slugs: ['madhyapradesh2023'] },
  CG: { year: '2023', slugs: ['chhattisgarh2023', 'chattisgarh2023'] },
  RJ: { year: '2023', slugs: ['rajasthan2023'] },
  MZ: { year: '2023', slugs: ['mizoram2023'] },
  ML: { year: '2023', slugs: ['meghalaya2023'] },
  NL: { year: '2023', slugs: ['nagaland2023'] },
  TR: { year: '2023', slugs: ['tripura2023'] },
  WB: { year: '2021', slugs: ['westbengal2021'] },
  TN: { year: '2021', slugs: ['tamilnadu2021'] },
  KL: { year: '2021', slugs: ['kerala2021'] },
  AS: { year: '2021', slugs: ['assam2021'] },
  PY: { year: '2021', slugs: ['puducherry2021'] },
  MH: { year: '2024', slugs: ['maharashtra2024'] },
  HR: { year: '2024', slugs: ['haryana2024'] },
  JH: { year: '2024', slugs: ['jharkhand2024'] },
  JK: { year: '2024', slugs: ['jammukashmir2024', 'jammuandkashmir2024'] },
  AP: { year: '2024', slugs: ['andhrapradesh2024'] },
  OD: { year: '2024', slugs: ['odisha2024'] },
  AR: { year: '2024', slugs: ['arunachalpradesh2024'] },
  SK: { year: '2024', slugs: ['sikkim2024'] },
  DL: { year: '2025', slugs: ['delhi2025', 'delhi2020'] },
  BR: { year: '2020', slugs: ['bihar2025', 'bihar2020'] },
};

async function getHtml(u: string): Promise<string | null> {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (r.ok) return r.text();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 600 * (a + 1)));
  }
  return null;
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Constituency key: collapse case, punctuation, and the (SC)/(ST) suffix.
const consKey = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\((?:sc|st)\)/g, ' ').replace(/&/g, ' and ').replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '').trim();

// Levenshtein distance — for tolerating light transliteration variance in
// constituency names (e.g. Bengali/Tamil seat spellings) when joining safely.
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Name key: drop honorifics/initials noise, keep alnum tokens for overlap scoring.
const nameTokens = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(dr|adv|advocate|shri|smt|kumari|mr|mrs|ms|prof|er|md|mohd|mohammad|mohammed|syed)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 1);
function nameScore(a: string, b: string): number {
  const ta = new Set(nameTokens(a)), tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
function nameMatch(a: string, b: string): boolean {
  const ta = new Set(nameTokens(a)), tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return false;
  const jac = nameScore(a, b);
  const ca = [...ta].join(''), cb = [...tb].join('');
  return jac >= 0.5 || ca.includes(cb) || cb.includes(ca);
}

function money(s: string): string {
  const t = s.replace(/Rs\.?\s*/i, '₹').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(₹[\d,]+)\s*(?:~\s*(.*))?$/);
  if (!m) return t;
  const approx = (m[2] || '').replace(/\+$/, '').trim();
  return approx ? `${m[1]} (~${approx})` : m[1];
}

interface Row { candidateId: string; name: string; cons: string; criminal: string; education: string; assets: string; liabilities: string; }
function parsePage(html: string): Row[] {
  const rows: Row[] = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const idm = tr.match(/candidate_id=(\d+)/);
    if (!idm) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 8) continue;
    // Sno | Candidate | Constituency | Party | Criminal Case | Education | Total Assets | Liabilities
    rows.push({ candidateId: idm[1], name: cells[1], cons: cells[2], criminal: cells[4], education: cells[5], assets: cells[6], liabilities: cells[7] });
  }
  return rows;
}

async function fetchWinners(slugs: string[]): Promise<{ slug: string; byCons: Map<string, Row>; list: Row[] } | null> {
  for (const slug of slugs) {
    const base = `https://www.myneta.info/${slug}`;
    const byCons = new Map<string, Row>();
    const list: Row[] = [];
    let got = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await getHtml(`${base}/index.php?action=summary&subAction=winner_analyzed&sort=candidate&page=${page}`);
      if (html === null) break;
      const rows = parsePage(html);
      if (!rows.length) break;
      got = true;
      for (const r of rows) { list.push(r); if (!byCons.has(consKey(r.cons))) byCons.set(consKey(r.cons), r); }
      await new Promise((res) => setTimeout(res, 300));
    }
    if (got && list.length > 0) return { slug, byCons, list };
  }
  return null;
}

// Resolve the ONE affidavit row that safely corresponds to a sitting MLA, using
// (in order): exact-seat + name, fuzzy-seat (edit-distance ≤ 2) + name, or a
// UNIQUE strong name match across the state (names are distinctive within a
// single ~200-seat roster). Anything ambiguous returns null — never guessed.
function resolveWinner(p: Politician, byCons: Map<string, Row>, list: Row[]): Row | null {
  const ck = consKey(p.constituencyName);
  const exact = byCons.get(ck);
  if (exact && nameMatch(exact.name, p.name)) return exact;
  const fuzzySeat = list.filter((r) => nameMatch(r.name, p.name) && lev(consKey(r.cons), ck) <= 2);
  if (fuzzySeat.length === 1) return fuzzySeat[0];
  const strong = list.filter((r) => nameScore(r.name, p.name) >= 0.6);
  if (strong.length === 1) return strong[0];
  return null;
}

async function main() {
  const only = process.env.AFF_STATES ? new Set(process.env.AFF_STATES.split(',').map((s) => s.trim().toUpperCase())) : null;
  const pols: Politician[] = JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8'));
  const mlasByState = new Map<string, Politician[]>();
  for (const p of pols) if (p.house === 'Vidhan Sabha') {
    if (!mlasByState.has(p.stateCode)) mlasByState.set(p.stateCode, []);
    mlasByState.get(p.stateCode)!.push(p);
  }

  let statesApplied = 0, matched = 0, factsAdded = 0;
  const report: string[] = [];

  for (const [code, cfg] of Object.entries(SLUGS)) {
    if (only && !only.has(code)) continue;
    const mlas = mlasByState.get(code);
    if (!mlas || !mlas.length) { report.push(`${code}: no MLAs in seed — skipped`); continue; }

    process.stdout.write(`\n${code} (${cfg.slugs.join('/')}) … `);
    const res = await fetchWinners(cfg.slugs);
    if (!res) { report.push(`${code}: no MyNeta page reachable — skipped`); process.stdout.write('no page'); continue; }

    // Overlap guard: how many of our seats resolve to a safe winner row?
    // (Same resolver used to apply, so the gate measures true match quality —
    // robust to constituency-name transliteration in Bengali/Tamil/etc.)
    const resolved = new Map<string, Row>();
    for (const p of mlas) { const r = resolveWinner(p, res.byCons, res.list); if (r) resolved.set(p.id, r); }
    const overlap = resolved.size / mlas.length;
    process.stdout.write(`${res.list.length} winners, overlap ${(overlap * 100).toFixed(0)}% of ${mlas.length} seats`);
    if (overlap < OVERLAP_MIN) {
      report.push(`${code}: overlap ${(overlap * 100).toFixed(0)}% (<${OVERLAP_MIN * 100}%) via ${res.slug} — WRONG election, skipped`);
      continue;
    }

    // Apply, per row, only where the resolver found a safe match.
    let sMatched = 0, sFacts = 0;
    for (const p of mlas) {
      const row = resolved.get(p.id);
      if (!row) continue;
      sMatched++;
      const cite = { source_url: `https://www.myneta.info/${res.slug}/candidate.php?candidate_id=${row.candidateId}`, source_name: `MyNeta / ADR — ${cfg.year} assembly affidavit`, retrieved_date: TODAY, as_of: `${cfg.year} assembly election affidavit` };
      const have = new Set(p.facts.map((f) => f.field_type));
      const add = (ft: string, val: string) => { if (val && !have.has(ft)) { p.facts.push({ field_type: ft, value: val, ...cite } as Fact); have.add(ft); sFacts++; } };
      if (/₹|Rs|\d/.test(row.assets)) add('assets_total', money(row.assets));
      if (/₹|Rs|\d/.test(row.liabilities)) add('liabilities_total', money(row.liabilities));
      if (/^\d+$/.test(row.criminal.trim())) add('criminal_cases_declared', row.criminal.trim());
      if (row.education && !/^(nan|n\/?a|not given|-)?$/i.test(row.education.trim())) add('education', row.education.trim());
    }
    statesApplied++; matched += sMatched; factsAdded += sFacts;
    report.push(`${code}: ✓ ${res.slug} — matched ${sMatched}/${mlas.length} seats, +${sFacts} facts`);
  }

  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(pols, null, 2) + '\n');
  console.log(`\n\n✓ Applied ${statesApplied} states — matched ${matched} MLAs, added ${factsAdded} affidavit facts.`);
  console.log('\nPer-state:');
  for (const r of report) console.log('  ' + r);
  console.log('\nNext: npm run dm -- validate   then rebuild indexes + build.');
}

main().catch((e) => { console.error(e); process.exit(1); });
