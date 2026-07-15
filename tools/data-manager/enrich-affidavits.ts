/**
 * Data-manager step: add each MP's ELECTION-AFFIDAVIT figures - declared assets,
 * liabilities and pending criminal cases - from MyNeta (ADR), which compiles the
 * official self-sworn affidavits filed with the Election Commission for the 2024
 * Lok Sabha election. Shown strictly "as declared", each cited to the member's
 * MyNeta page. NO characterisation is added; a declared case is a pending trial,
 * not a conviction (the profile UI states this).
 *
 * Join is by constituency (the winner list has exactly one winner per seat).
 * Only fills gaps - never overwrites a curated fact.
 *
 * Usage:  npm run dm -- enrich-affidavits
 *         AFF_LIMIT=3   npm run dm -- enrich-affidavits   (first 3 pages - testing)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact } from '../../lib/types';
import { nameMatches } from './myneta';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const BASE = 'https://www.myneta.info/LokSabha2024';
const LIST = (page: number) => `${BASE}/index.php?action=summary&subAction=winner_analyzed&sort=candidate&page=${page}`;
const CAND = (id: string) => `${BASE}/candidate.php?candidate_id=${id}`;
const UA = 'Mozilla/5.0 (RankYourPolitician civic-info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);
const MAX_PAGES = process.env.AFF_LIMIT ? parseInt(process.env.AFF_LIMIT, 10) : 30;

async function getHtml(u: string): Promise<string> {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (r.ok) return r.text();
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 600 * (a + 1)));
  }
  throw new Error('fetch failed: ' + u);
}

// Constituency key: collapse case, punctuation, "and"/"&", spacing, and the
// (SC)/(ST) reservation suffix that MyNeta appends but our names omit.
const consKey = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\((?:sc|st)\)/g, ' ')
    .replace(/&/g, ' and ').replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '').trim();

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** "Rs 8,05,85,824 ~ 8 Crore+"  ->  "₹8,05,85,824 (~8 Crore)" */
function money(s: string): string {
  const t = s.replace(/Rs\.?\s*/i, '₹').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(₹[\d,]+)\s*(?:~\s*(.*))?$/);
  if (!m) return t;
  const approx = (m[2] || '').replace(/\+$/, '').trim();
  return approx ? `${m[1]} (~${approx})` : m[1];
}

interface Row { candidateId: string; name: string; cons: string; criminal: string; assets: string; liabilities: string; }

function parsePage(html: string): Row[] {
  const rows: Row[] = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const idm = tr.match(/candidate_id=(\d+)/);
    if (!idm) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 8) continue;
    // Sno | Candidate | Constituency | Party | Criminal Case | Education | Total Assets | Liabilities
    rows.push({
      candidateId: idm[1],
      name: cells[1],
      cons: cells[2],
      criminal: cells[4],
      assets: cells[6],
      liabilities: cells[7],
    });
  }
  return rows;
}

async function main() {
  console.log('Fetching MyNeta winner-affidavit pages…');
  const byCons = new Map<string, Row>();
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const html = await getHtml(LIST(page));
    const rows = parsePage(html);
    if (!rows.length) break;
    for (const r of rows) if (!byCons.has(consKey(r.cons))) byCons.set(consKey(r.cons), r);
    process.stdout.write(`  page ${page}: ${rows.length} winners (total ${byCons.size})\r`);
    await new Promise((res) => setTimeout(res, 300)); // be polite
  }
  console.log(`\n✓ Collected ${byCons.size} winner affidavits over ${page - 1} pages.`);

  const pols: Politician[] = JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8'));
  let matched = 0, factsAdded = 0;
  const unmatched: string[] = [];

  for (const p of pols) {
    // Lok Sabha only. This list is the 2024 PARLIAMENTARY winners, and an
    // assembly seat can share a name with a parliamentary one - without this
    // an MLA could be handed an MP's affidavit.
    if (p.house !== 'Lok Sabha') continue;
    const row = byCons.get(consKey(p.constituencyName));
    if (!row) { unmatched.push(`${p.constituencyName} (${p.name})`); continue; }
    // The seat name alone is NOT unique across India - Bihar and Maharashtra both
    // have an Aurangabad, Bihar and UP both a Maharajganj - and this summary list
    // carries no state column, so the constituency key silently collides. The
    // winner's NAME is the only available disambiguator here; without it, Bihar's
    // Aurangabad winner was written onto Maharashtra's MP (16 declared criminal
    // cases attributed to a man who declared 4). Mismatches are reported, never
    // guessed; enrich-affidavits-byseat.ts resolves them properly, with state.
    if (!nameMatches(row.name, p.name)) {
      unmatched.push(`${p.constituencyName}: roster "${p.name}" vs MyNeta "${row.name}" - AMBIGUOUS SEAT NAME, skipped`);
      continue;
    }
    matched++;
    const cite = { source_url: CAND(row.candidateId), source_name: 'MyNeta / ADR - 2024 election affidavit', retrieved_date: TODAY, as_of: '2024 election affidavit' };
    const have = new Set(p.facts.map((f) => f.field_type));
    const add = (field_type: string, value: string) => {
      if (!have.has(field_type)) { p.facts.push({ field_type, value, ...cite } as Fact); factsAdded++; have.add(field_type); }
    };
    if (/₹|Rs|\d/.test(row.assets)) add('assets_total', money(row.assets));
    if (/₹|Rs|\d/.test(row.liabilities)) add('liabilities_total', money(row.liabilities));
    if (/^\d+$/.test(row.criminal.trim())) add('criminal_cases_declared', row.criminal.trim());
  }

  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(pols, null, 2) + '\n');
  console.log(`✓ Matched ${matched} MPs by constituency; added ${factsAdded} affidavit facts.`);
  if (unmatched.length) console.log(`⚠ Unmatched (${unmatched.length}): ${unmatched.slice(0, 20).join('; ')}${unmatched.length > 20 ? '…' : ''}`);
  console.log('\nNext: npm run dm -- validate   then   npm run dm -- publish');
}

main().catch((e) => { console.error(e); process.exit(1); });
