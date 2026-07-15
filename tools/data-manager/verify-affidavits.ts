/**
 * Data-manager step: audit stored affidavit facts against the pages they cite.
 *
 * This is the read-only counterpart to the enrich-affidavits* steps. Affidavit
 * data is the most defamation-sensitive thing the site publishes - a criminal
 * case count attached to the wrong person is the worst error we can make - so
 * this re-fetches each cited MyNeta page and checks two things:
 *
 *   1. IDENTITY  - the candidate named on the cited page really is our member.
 *      Catches a bad join (namesake, stale roster, wrong seat).
 *   2. FIDELITY  - the value we stored is the value that page states today.
 *      Catches a parser regression, or a source that has since been corrected.
 *
 * It writes nothing. Findings are printed for a human to act on, because the
 * right fix differs per case (re-run an enricher, curate by hand, or drop).
 *
 * Note on liabilities: the figure checked is the affidavit's own "Grand Total of
 * Liabilities (as per affidavit)", NOT the total MyNeta prints in its page
 * header - those disagree for roughly one candidate in six, and we publish
 * declared values. See myneta.ts:parseCandidatePage.
 *
 * Usage:  npm run dm -- verify-affidavits              (samples ~2 per election)
 *         AFF_VERIFY_ALL=1 npm run dm -- verify-affidavits    (every member - slow)
 *         AFF_VERIFY_SINCE=2026-07-15 npm run dm -- verify-affidavits
 *         AFF_VERIFY_SLUGS=LokSabha2024 AFF_VERIFY_ALL=1 npm run dm -- verify-affidavits
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact } from '../../lib/types';
import { getHtml, parseCandidatePage, clean, consKey, seatClose, nameCouldBeSame, rupees, pool, type Affidavit } from './myneta';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const CHECKED = ['assets_total', 'liabilities_total', 'criminal_cases_declared'] as const;
const ALL = process.env.AFF_VERIFY_ALL === '1';
const SINCE = process.env.AFF_VERIFY_SINCE;
// Verifying every election in one process re-fetches ~4,500 pages and the run
// does not survive to print its summary; AFF_VERIFY_SLUGS lets it be done in
// completable batches (e.g. AFF_VERIFY_SLUGS=LokSabha2024,bihar2025).
const SLUGS = process.env.AFF_VERIFY_SLUGS
  ? new Set(process.env.AFF_VERIFY_SLUGS.split(',').map((s) => s.trim()))
  : null;

const slugOf = (url: string) => (url.match(/myneta\.info\/([A-Za-z0-9_]+)\//) || [])[1] || '';

/** The candidate name as printed on a MyNeta detail page header. */
function pageName(html: string): string {
  const h2 = clean((html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || '');
  // Headers read "<Election> <Name>" or "<Council> <Name> (Winner)".
  return h2
    .replace(/\(winner\)/i, ' ')
    .replace(/^.*?\b(?:Lok Sabha|Vidhan Sabha|Legislative Council|Assembly)\b\s*\d{0,4}/i, ' ')
    .replace(/^\D*?\d{4}/, ' ')
    .trim();
}

/**
 * The SEAT the cited page belongs to, from its breadcrumb - which reads
 * "Home > Gujarat 2022 > VADODARA > MANJALPUR > YOGESHBHAI NARANDAS PATEL".
 *
 * This is the strongest identity check available, and much better than the name:
 * names repeat within a state (Gujarat seats two different "Yogesh Patel"s), so
 * a name can look right while the page belongs to another seat entirely. The
 * seat cannot. Returns null for pages with no seat (Legislative Councils).
 */
function pageSeat(html: string): string | null {
  const bc = html.match(/&rarr;[\s\S]{0,600}?<\/div>/i);
  if (!bc) return null;
  const parts = clean(bc[0]).split(/&rarr;|→|>/).map((s) => s.trim()).filter(Boolean);
  // …> STATE > SEAT > NAME (Criminal & Asset Declaration)
  const nameIdx = parts.findIndex((s) => /\(Criminal/i.test(s));
  if (nameIdx < 1) return null;
  const seat = parts[nameIdx - 1];
  return seat && !/Legislative Council/i.test(seat) ? seat : null;
}

/** Seat key: drop MyNeta's by-election suffix and the (SC)/(ST)/(BL) reservation
 *  markers, but KEEP other parentheticals - "(Central)", "(Urban)", "(West)" are
 *  part of the seat's name, not decoration. */
const seatKey = (s: string) =>
  consKey(
    (s || '')
      .replace(/:\s*BYE ELECTION.*$/i, ' ')
      .replace(/\((?:sc|st|bl|gen)\)/gi, ' ')
      .replace(/\b(cantonment|cantt\.?)\b/gi, 'cant'),
  );

/** Is the cited page's seat the member's seat? Tolerates spelling variance and
 *  the district qualifier our roster adds to disambiguate duplicate seat names
 *  ("Prathipadu (Guntur)" vs MyNeta's plain "PRATHIPADU"). */
function seatAgrees(pageSeatName: string, ourSeat: string): boolean {
  const a = seatKey(pageSeatName), b = seatKey(ourSeat);
  if (!a || !b) return true;
  if (a === b) return true;
  // seatClose compares any trailing seat number exactly, so a North-1/North-2
  // swap can never be waved through as "one character of spelling variance" -
  // which is exactly how this audit once certified the Aizawl North swap.
  if (seatClose(a, b)) return true;
  // Our roster adds a district qualifier to disambiguate duplicate seat names
  // ("Prathipadu (Guntur)" vs MyNeta's plain "PRATHIPADU"), so a prefix is fine -
  // but never across differing seat numbers.
  if ((a.match(/(\d+)$/) || [])[1] !== (b.match(/(\d+)$/) || [])[1]) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short);
}

async function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));

  const anchored = pols
    .map((p) => ({ p, f: p.facts.find((x) => x.field_type === 'assets_total' && /myneta\.info/.test(x.source_url || '')) }))
    .filter((x): x is { p: Politician; f: Fact } => !!x.f)
    .filter((x) => !SINCE || x.f.retrieved_date >= SINCE)
    .filter((x) => !SLUGS || SLUGS.has(slugOf(x.f.source_url)));

  // Default to a spread sample: 2 per election is enough to catch a systematic
  // parser or join fault, without re-fetching thousands of pages.
  let targets = anchored;
  if (!ALL) {
    const bySlug = new Map<string, typeof anchored>();
    for (const x of anchored) {
      const s = slugOf(x.f.source_url);
      if (!bySlug.has(s)) bySlug.set(s, []);
      bySlug.get(s)!.push(x);
    }
    targets = [...bySlug.values()].flatMap((a) => a.slice(0, 2));
  }
  console.log(`Verifying ${targets.length} of ${anchored.length} MyNeta-cited members…`);

  let idOk = 0, valOk = 0, fetchFail = 0, seatChecked = 0, seatOk = 0;
  const problems: string[] = [];

  // Check each page as it arrives and let the HTML go. Collecting all of them
  // first held ~4,500 pages (~300MB of markup) live at once and the process died
  // before printing a single finding - an audit that cannot finish is an audit
  // that certifies nothing.
  await pool(targets, 5, async ({ p, f }) => {
    const html = await getHtml(f.source_url);
    if (!html) { fetchFail++; return; }
    const parsed: Affidavit = parseCandidatePage(html);
    const name = pageName(html);

    // Seat first: it is decisive where it exists. A page for another seat is a
    // wrong join no matter how similar the names look.
    const seat = pageSeat(html);
    if (seat && p.constituencyType !== 'MLC' && p.constituencyType !== 'RS') {
      seatChecked++;
      if (seatAgrees(seat, p.constituencyName)) seatOk++;
      else problems.push(`WRONG SEAT ${p.name} (${p.state} ${p.constituencyName})\n            cited page is for seat "${seat}" - "${name}"  ${f.source_url}`);
    }

    const identityOk = !name || nameCouldBeSame(name, p.name);
    if (identityOk) idOk++;
    else problems.push(`IDENTITY  ${p.name} (${p.state} ${p.constituencyName})\n            cited page names "${name}"  ${f.source_url}`);

    const drift = CHECKED.map((t) => {
      const stored = p.facts.find((x) => x.field_type === t)?.value;
      const now = parsed[t];
      if (stored === undefined || now === undefined || stored === now) return null;
      // Compare the FACT, not its wording. A curated entry may state the same
      // thing in a richer form - "Rs 5,27,28,999 (movable Rs 3,64,94,169;
      // immovable Rs 1,72,84,830)", or "1 case declared/pending trial (IPC
      // sections 143, 145, 341, 149)" - and that is editorial detail, not a
      // disagreement with the source. Only a different NUMBER is drift.
      if (t === 'criminal_cases_declared') {
        const count = (v: string) => (v.match(/\d+/) || [])[0];
        if (count(stored) !== undefined && count(stored) === count(now)) return null;
      } else if (rupees(stored) === rupees(now)) return null;
      return `${t}: stored ${stored} / page ${now}`;
    }).filter(Boolean);
    if (!drift.length) valOk++;
    else problems.push(`VALUE     ${p.name} (${p.state} ${p.constituencyName})  ${f.source_url}\n            ${drift.join('\n            ')}`);
  });

  const n = targets.length - fetchFail;
  console.log(`\n  identity matches cited page : ${idOk}/${n}`);
  console.log(`  values reproduce cited page  : ${valOk}/${n}`);
  if (seatChecked) console.log(`  cited page is the right SEAT : ${seatOk}/${seatChecked}`);
  if (fetchFail) console.log(`  unreachable pages           : ${fetchFail}`);
  if (problems.length) {
    console.log(`\n${problems.length} finding(s):`);
    for (const x of problems) console.log('  ✗ ' + x);
    process.exitCode = 1;
  } else {
    console.log('\n✓ Every checked member matches the page it cites.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
