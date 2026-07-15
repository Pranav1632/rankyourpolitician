/**
 * Data-manager step: fill in ELECTION-AFFIDAVIT figures (declared assets,
 * liabilities, pending criminal cases, declared education) for sitting Lok
 * Sabha MPs and MLAs, from MyNeta (ADR) - the self-sworn Form-26 affidavits
 * filed with the Election Commission. Everything is shown strictly "as
 * declared"; a declared case is a pending trial, not a conviction.
 *
 * WHY THIS EXISTS ALONGSIDE enrich-affidavits{,-states}.ts
 * Those steps read MyNeta's summary lists, which silently omit every candidate
 * whose assets/liabilities are rendered as IMAGES rather than text - Lok Sabha
 * 2024's winner list returns 483 of 543 winners for that reason, and ~1 MLA in
 * 5 is likewise unreachable. This step instead walks the PER-SEAT pages
 * (action=show_candidates&constituency_id=N), which exist for every seat and
 * flag the winner explicitly, then reads that winner's own candidate page.
 * It is fill-only, so it composes with the summary steps rather than replacing
 * them: run those first (they are cheaper), then this to close the gap.
 *
 * SAFETY - this is the most sensitive data we hold, so a figure is written only
 * when BOTH hold:
 *   1. the seat matches (exactly, or within transliteration tolerance), AND
 *   2. the winner's name matches our sitting member for that seat.
 * A seat whose MyNeta winner is somebody else (a by-election has since changed
 * the member, a roster is stale) is skipped and reported - never guessed.
 * Matching on the NAME ALONE, with no seat agreement, is off by default
 * (BYSEAT_ALLOW_NAME_ONLY=1 re-enables it): it can attach any seat's winner to a
 * member, and did - Sakra's "Aditya Kumar" onto Parbatta's "Aditya Kumar
 * Shorya". Run `npm run dm -- verify-affidavits` after any enrichment; its
 * breadcrumb seat-check is what catches this class of error.
 *
 * The election YEAR in every citation is derived from the slug that actually
 * resolved, never hardcoded - a mislabelled year is how 183 Bihar MLAs ended up
 * citing bihar2025 pages as "2020 assembly election affidavit".
 *
 * Usage:  npm run dm -- enrich-affidavits-byseat
 *         BYSEAT_ONLY=LS,UP,KA  npm run dm -- enrich-affidavits-byseat
 *         BYSEAT_DRY=1          npm run dm -- enrich-affidavits-byseat   (report only)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact } from '../../lib/types';
import {
  getHtml, parseSeatPage, parseCandidatePage, consKey, stateKey, seatClose, nameMatches, nameScore, lev, fillFact, pool,
  type SeatRow,
} from './myneta';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const CACHE_DIR = resolve(ROOT, 'tools', 'data-manager', '.cache');
const TODAY = new Date().toISOString().slice(0, 10);
const CONCURRENCY = 6; // MyNeta is a small non-profit site - stay gentle
// A name-only match (no seat agreement) may attach ANY seat's winner to a
// member, and has empirically done so - it is how Bihar's Sakra winner "Aditya
// Kumar" was once written onto Parbatta's "Aditya Kumar Shorya". Off unless
// explicitly asked for; the coverage it buys is not worth a misattributed
// criminal record.
const ALLOW_NAME_ONLY = process.env.BYSEAT_ALLOW_NAME_ONLY === '1';
const DRY = process.env.BYSEAT_DRY === '1';

/** One election per house+state. Slugs are tried in order; the first that has
 *  seats wins, and its digits become the cited year.
 *
 *  `spansStates` marks an election whose pages cover the whole country, so a
 *  seat name is NOT unique within it: Bihar and Maharashtra both have an
 *  Aurangabad, Bihar and UP both a Maharajganj. Those elections MUST additionally
 *  match on state or the join silently crosses state lines. (A state-assembly
 *  slug is already scoped to one state, so its seat names are unique within it.)
 */
const ELECTIONS: { key: string; house: Politician['house']; stateCode?: string; spansStates?: boolean; slugs: string[] }[] = [
  { key: 'LS', house: 'Lok Sabha', spansStates: true, slugs: ['LokSabha2024'] },
  { key: 'UP', house: 'Vidhan Sabha', stateCode: 'UP', slugs: ['uttarpradesh2022'] },
  { key: 'PB', house: 'Vidhan Sabha', stateCode: 'PB', slugs: ['punjab2022'] },
  { key: 'UK', house: 'Vidhan Sabha', stateCode: 'UK', slugs: ['uttarakhand2022'] },
  { key: 'GA', house: 'Vidhan Sabha', stateCode: 'GA', slugs: ['goa2022'] },
  { key: 'MN', house: 'Vidhan Sabha', stateCode: 'MN', slugs: ['manipur2022'] },
  { key: 'GJ', house: 'Vidhan Sabha', stateCode: 'GJ', slugs: ['gujarat2022'] },
  { key: 'HP', house: 'Vidhan Sabha', stateCode: 'HP', slugs: ['himachalpradesh2022', 'himachal2022'] },
  { key: 'KA', house: 'Vidhan Sabha', stateCode: 'KA', slugs: ['karnataka2023'] },
  { key: 'TG', house: 'Vidhan Sabha', stateCode: 'TG', slugs: ['telangana2023'] },
  { key: 'MP', house: 'Vidhan Sabha', stateCode: 'MP', slugs: ['madhyapradesh2023'] },
  { key: 'CG', house: 'Vidhan Sabha', stateCode: 'CG', slugs: ['chhattisgarh2023', 'chattisgarh2023'] },
  { key: 'RJ', house: 'Vidhan Sabha', stateCode: 'RJ', slugs: ['rajasthan2023'] },
  { key: 'MZ', house: 'Vidhan Sabha', stateCode: 'MZ', slugs: ['mizoram2023'] },
  { key: 'ML', house: 'Vidhan Sabha', stateCode: 'ML', slugs: ['meghalaya2023'] },
  { key: 'NL', house: 'Vidhan Sabha', stateCode: 'NL', slugs: ['nagaland2023'] },
  { key: 'TR', house: 'Vidhan Sabha', stateCode: 'TR', slugs: ['tripura2023'] },
  { key: 'WB', house: 'Vidhan Sabha', stateCode: 'WB', slugs: ['WestBengal2026'] },
  { key: 'TN', house: 'Vidhan Sabha', stateCode: 'TN', slugs: ['TamilNadu2026'] },
  { key: 'KL', house: 'Vidhan Sabha', stateCode: 'KL', slugs: ['Kerala2026'] },
  { key: 'AS', house: 'Vidhan Sabha', stateCode: 'AS', slugs: ['Assam2026'] },
  { key: 'PY', house: 'Vidhan Sabha', stateCode: 'PY', slugs: ['Puducherry2026'] },
  { key: 'MH', house: 'Vidhan Sabha', stateCode: 'MH', slugs: ['maharashtra2024'] },
  { key: 'HR', house: 'Vidhan Sabha', stateCode: 'HR', slugs: ['haryana2024'] },
  { key: 'JH', house: 'Vidhan Sabha', stateCode: 'JH', slugs: ['jharkhand2024'] },
  { key: 'JK', house: 'Vidhan Sabha', stateCode: 'JK', slugs: ['jammukashmir2024', 'jammuandkashmir2024'] },
  { key: 'AP', house: 'Vidhan Sabha', stateCode: 'AP', slugs: ['andhrapradesh2024'] },
  { key: 'OD', house: 'Vidhan Sabha', stateCode: 'OD', slugs: ['odisha2024'] },
  { key: 'AR', house: 'Vidhan Sabha', stateCode: 'AR', slugs: ['arunachalpradesh2024'] },
  { key: 'SK', house: 'Vidhan Sabha', stateCode: 'SK', slugs: ['sikkim2024'] },
  { key: 'DL', house: 'Vidhan Sabha', stateCode: 'DL', slugs: ['delhi2025'] },
  { key: 'BR', house: 'Vidhan Sabha', stateCode: 'BR', slugs: ['bihar2025'] },
];

const yearOf = (slug: string) => (slug.match(/(\d{4})/) || [])[1] || '';

/** Seat ids for an election, straight from its index page (they are NOT 1-based:
 *  karnataka2023 runs 609..841), then each seat page fetched for its winner. */
async function scanSeats(slug: string): Promise<SeatRow[] | null> {
  const cacheFile = resolve(CACHE_DIR, `seats-${slug}.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8'));

  const index = await getHtml(`https://www.myneta.info/${slug}/`);
  if (!index) return null;
  const ids = [...new Set([...index.matchAll(/constituency_id=(\d+)/g)].map((m) => +m[1]))].sort((a, b) => a - b);
  if (!ids.length) return null;

  process.stdout.write(`${ids.length} seats `);
  const rows = await pool(ids, CONCURRENCY, async (id) => {
    const html = await getHtml(`https://www.myneta.info/${slug}/index.php?action=show_candidates&constituency_id=${id}`);
    return html ? parseSeatPage(html, id) : null;
  });
  const seats = rows.filter((r): r is SeatRow => !!r);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(seats));
  return seats;
}

/** The one winner row that safely corresponds to this member, or null. */
function resolveWinner(p: Politician, seats: SeatRow[], spansStates = false): SeatRow | null {
  let withWinner = seats.filter((s) => s.winner);
  // Country-wide election: restrict to the member's own state before anything
  // else, so a same-named seat in another state can never be considered.
  if (spansStates) {
    const mine = withWinner.filter((s) => stateKey(s.state) === stateKey(p.state));
    // Only apply when the filter actually resolves to something; a state whose
    // page labels we cannot parse must fail closed, not fall back to all-India.
    if (!mine.length) return null;
    withWinner = mine;
  }
  const ck = consKey(p.constituencyName);

  // A by-election supersedes the general election for the same seat, so prefer
  // the most recent row when both exist.
  const bySeat = withWinner
    .filter((s) => consKey(s.cons) === ck)
    .sort((a, b) => Number(b.isBye) - Number(a.isBye));
  const exact = bySeat.find((s) => nameMatches(s.winner!.name, p.name));
  if (exact) return exact;

  // Seat within transliteration tolerance (Mandsaur/MANDSOUR, Arambagh/ARAMBAG)
  // AND the name agrees. seatClose compares any trailing seat NUMBER exactly and
  // keeps the distance small relative to the name - a flat "<=3 edits" makes
  // "andole" and "mudhole" neighbours (how Mudhole's winner reached the MLA for
  // Andole) and makes "aizawlnorth1" and "aizawlnorth2" neighbours too.
  const fuzzy = withWinner.filter((s) => seatClose(consKey(s.cons), ck) && nameMatches(s.winner!.name, p.name));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    const best = fuzzy.sort((a, b) => lev(consKey(a.cons), ck) - lev(consKey(b.cons), ck));
    if (lev(consKey(best[0].cons), ck) < lev(consKey(best[1].cons), ck)) return best[0];
  }

  // Last resort, off by default: a UNIQUE strong name match anywhere in this
  // election, with no seat agreement at all. See ALLOW_NAME_ONLY above.
  if (!ALLOW_NAME_ONLY) return null;
  const strong = withWinner.filter((s) => nameScore(s.winner!.name, p.name) >= 0.6);
  return strong.length === 1 ? strong[0] : null;
}

const AFFIDAVIT_FIELDS = ['assets_total', 'liabilities_total', 'criminal_cases_declared'];
const needsAffidavit = (p: Politician) => {
  const have = new Set(p.facts.map((f) => f.field_type));
  return !AFFIDAVIT_FIELDS.every((f) => have.has(f));
};

async function main() {
  const only = process.env.BYSEAT_ONLY
    ? new Set(process.env.BYSEAT_ONLY.split(',').map((s) => s.trim().toUpperCase()))
    : null;
  const pols: Politician[] = JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8'));

  let totalFilled = 0, totalFacts = 0;
  const report: string[] = [];
  const unresolved: string[] = [];

  for (const el of ELECTIONS) {
    if (only && !only.has(el.key)) continue;
    const members = pols.filter(
      (p) => p.house === el.house && (!el.stateCode || p.stateCode === el.stateCode) && needsAffidavit(p),
    );
    if (!members.length) { report.push(`${el.key}: nothing missing - skipped`); continue; }

    process.stdout.write(`\n${el.key.padEnd(3)} (${members.length} missing) … `);

    let seats: SeatRow[] | null = null, slug = '';
    for (const s of el.slugs) { seats = await scanSeats(s); if (seats?.length) { slug = s; break; } }
    if (!seats?.length) { report.push(`${el.key}: no MyNeta election page reachable - skipped`); process.stdout.write('no page'); continue; }

    const year = yearOf(slug);
    const houseWord = el.house === 'Lok Sabha' ? 'election affidavit' : 'assembly election affidavit';
    /**
     * A by-election winner filed for the BY-ELECTION, not for the general
     * election whose slug hosts the page - resolveWinner deliberately prefers
     * the by-poll row, so labelling it with the slug's year asserts an election
     * the member never contested. MyNeta states the by-poll date on the page
     * ("PORBANDAR : BYE ELECTION ON 07-05-2024"), so take the year from there.
     */
    const labelFor = (s: SeatRow) => {
      if (!s.isBye) return `${year} ${houseWord}`;
      const d = `${s.cons} ${s.state}`.match(/BYE ELECTION ON \d{2}-\d{2}-(\d{4})/i);
      return d ? `${d[1]} by-election affidavit` : 'by-election affidavit';
    };

    // Resolve first, so we only fetch detail pages we will actually use.
    const attempts = members.map((p) => ({ p, seat: resolveWinner(p, seats!, el.spansStates) }));
    const resolved = attempts.filter((x): x is { p: Politician; seat: SeatRow } => !!x.seat);
    for (const { p } of attempts.filter((x) => !x.seat)) {
      unresolved.push(`${el.key} ${p.constituencyName} - ${p.name}`);
    }
    process.stdout.write(`${seats.length} seats, resolved ${resolved.length}/${members.length} … `);

    const details = await pool(resolved, CONCURRENCY, async ({ seat }) => {
      const html = await getHtml(`https://www.myneta.info/${slug}/candidate.php?candidate_id=${seat.winner!.candidateId}`);
      return html ? parseCandidatePage(html) : null;
    });

    let filled = 0, facts = 0;
    resolved.forEach(({ p, seat }, i) => {
      const aff = details[i];
      if (!aff) return;
      const label = labelFor(seat);
      const cite: Omit<Fact, 'field_type' | 'value'> = {
        source_url: `https://www.myneta.info/${slug}/candidate.php?candidate_id=${seat.winner!.candidateId}`,
        source_name: `MyNeta / ADR - ${label}`,
        retrieved_date: TODAY,
        as_of: label,
      };
      let added = 0;
      for (const f of ['assets_total', 'liabilities_total', 'criminal_cases_declared', 'education'] as const) {
        const v = aff[f];
        if (v && fillFact(p.facts, f, v, cite)) added++;
      }
      if (added) { filled++; facts += added; }
    });

    totalFilled += filled; totalFacts += facts;
    report.push(`${el.key}: ✓ ${slug} (${year}) - resolved ${resolved.length}/${members.length} missing, filled ${filled} members, +${facts} facts`);
    process.stdout.write(`+${facts} facts`);

    // Persist after every election: this walks tens of thousands of pages over
    // many minutes, and a network death near the end must not throw away the
    // states that already succeeded. Fill-only + cached scans make a re-run cheap
    // and idempotent.
    if (!DRY && facts) writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(pols, null, 2) + '\n');
  }

  if (!DRY) writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(pols, null, 2) + '\n');
  console.log(`\n\n${DRY ? '(dry run - nothing written) ' : '✓ '}Filled ${totalFilled} members, added ${totalFacts} affidavit facts.`);
  console.log('\nPer-election:');
  for (const r of report) console.log('  ' + r);
  if (unresolved.length) {
    // Not a failure - these are members MyNeta's election pages cannot safely be
    // joined to (a by-election changed the member, a nominee, a roster edge
    // case). Listed so the gap is visible and can be curated by hand.
    console.log(`\nUnresolved - no safe seat+name match (${unresolved.length}):`);
    for (const u of unresolved) console.log('  - ' + u);
  }
  console.log('\nNext: npm run dm -- validate');
}

main().catch((e) => { console.error(e); process.exit(1); });
