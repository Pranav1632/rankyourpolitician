/**
 * Data-manager step: fetch the per-case DETAIL behind every declared criminal
 * case, from the exact affidavit page each member already cites.
 *
 * The count fact (criminal_cases_declared) has existed for a while; this step
 * adds what the affidavit actually declares case by case - FIR/case number,
 * court, sections, charges-framed status, and any convictions with punishment
 * and appeal state - into data/seed/criminal_cases.json, verbatim from the
 * page, each record carrying the same citation as the count fact.
 *
 * Identity safety: NO new person matching happens here. A member is fetched
 * only through the candidate.php URL their own criminal_cases_declared fact
 * already cites, and the page's <title> name must still plausibly denote the
 * member (nameCouldBeSame) or the member is skipped and reported. A record is
 * never written on any ambiguity - missing beats wrong.
 *
 * Count consistency: the record stores the PAGE's own "Number of Criminal
 * Cases" figure. If the cited page's count has drifted from the stored fact
 * (MyNeta occasionally re-analyzes an affidavit), the fact value is refreshed
 * too - same rule as refresh-affidavit-values: only facts whose source_name
 * marks them MyNeta/ADR-sourced are ever touched, and only to match the page
 * they already cite. Hand-curated facts are never overwritten; on a conflict
 * with a hand-curated fact the member is skipped and reported instead.
 *
 * Usage:
 *   npx tsx tools/data-manager/fetch-criminal-cases.ts            (resume: skips fresh records)
 *   npx tsx tools/data-manager/fetch-criminal-cases.ts --force    (refetch everything)
 *   npx tsx tools/data-manager/fetch-criminal-cases.ts --limit 20 (first N targets - for testing)
 *   npx tsx tools/data-manager/fetch-criminal-cases.ts --only <politician-id>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact, CriminalRecord } from '../../lib/types';
import { getHtml, parseCriminalDetail, candidateTitleName, candidateTitleSeat, nameCouldBeSame, consKey, seatClose, pool } from './myneta';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const OUT = resolve(ROOT, 'data', 'seed', 'criminal_cases.json');

const FORCE = process.argv.includes('--force');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > 0 ? parseInt(process.argv[i + 1], 10) : Infinity; })();
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const TODAY = new Date().toISOString().slice(0, 10);
const MYNETA_PAGE = /myneta\.info\/[^/]+\/candidate\.php\?candidate_id=\d+/;
const MYNETA_SOURCED = /^MyNeta \/ ADR/;

function loadRecords(): Map<string, CriminalRecord> {
  if (!existsSync(OUT)) return new Map();
  const arr: CriminalRecord[] = JSON.parse(readFileSync(OUT, 'utf8'));
  return new Map(arr.map((r) => [r.politician_id, r]));
}

function saveRecords(records: Map<string, CriminalRecord>) {
  const arr = [...records.values()].sort((a, b) => a.politician_id.localeCompare(b.politician_id));
  writeFileSync(OUT, JSON.stringify(arr, null, 2) + '\n');
}

async function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  const records = loadRecords();

  interface Target { p: Politician; fact: Fact; n: number }
  const targets: Target[] = [];
  for (const p of pols) {
    if (ONLY && p.id !== ONLY) continue;
    const fact = p.facts.find((f) => f.field_type === 'criminal_cases_declared');
    if (!fact || !MYNETA_PAGE.test(fact.source_url || '')) continue;
    const n = parseInt(fact.value, 10);
    if (!Number.isFinite(n) || n <= 0) continue; // zero declared - the fact alone is the record
    // Resume: a record already read from this same page is fresh enough unless --force.
    const have = records.get(p.id);
    if (!FORCE && have && have.source_url === fact.source_url && have.declared_total === n) continue;
    targets.push({ p, fact, n });
  }
  const run = targets.slice(0, LIMIT);
  console.log(`${targets.length} members declare cases without an up-to-date detail record; fetching ${run.length}…`);

  let written = 0, unreachable = 0, drift = 0;
  const skipped: string[] = [];
  const warns: string[] = [];
  let done = 0;
  let factsTouched = false;

  await pool(run, 6, async ({ p, fact, n }) => {
    const html = await getHtml(fact.source_url);
    done++;
    if (done % 100 === 0) {
      console.log(`  …${done}/${run.length} fetched (${written} written)`);
      saveRecords(records); // survive interruption; the resume rule skips these
      if (factsTouched) writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');
    }
    if (!html) { unreachable++; return; }

    // The page must still be about OUR member. Two independent anchors, either
    // suffices: (a) the title name plausibly denotes the member (nameCouldBeSame
    // tolerates romanisation noise but fails when the names share almost
    // nothing), or (b) the title's constituency is the member's own seat -
    // the election slug in the cited URL already scopes the state, so a seat
    // match binds the page to the seat whose winner this citation was
    // established (and audited) as. Very short names defeat (a) legitimately
    // ("Vijaypal" / "Vijay Pal" have no comparable skeleton), which is what (b)
    // is for; a reassigned candidate id would land on a random other seat and
    // fail both.
    const pageName = candidateTitleName(html);
    const nameOk = pageName ? nameCouldBeSame(p.name, pageName) : false;
    const pageSeat = candidateTitleSeat(html);
    const seatOk = pageSeat ? seatClose(consKey(pageSeat), consKey(p.constituencyName)) : false;
    if (!nameOk && !seatOk) {
      skipped.push(`${p.id}: page title says "${pageName}" in "${pageSeat}" - matches neither name (${p.name}) nor seat (${p.constituencyName}) (${fact.source_url})`);
      return;
    }
    if (!nameOk) {
      warns.push(`${p.id}: accepted on seat match only - page name "${pageName}" vs roster "${p.name}" (${pageSeat} = ${p.constituencyName})`);
    }

    const d = parseCriminalDetail(html);
    if (d.declared_total == null) {
      skipped.push(`${p.id}: page states no case count (${fact.source_url})`);
      return;
    }

    if (d.declared_total !== n) {
      if (!MYNETA_SOURCED.test(fact.source_name || '')) {
        skipped.push(`${p.id}: page says ${d.declared_total} cases but the hand-curated fact says ${n} - left untouched`);
        return;
      }
      drift++;
      warns.push(`${p.id}: count drifted ${n} -> ${d.declared_total}; fact refreshed from the cited page`);
      fact.value = String(d.declared_total);
      fact.retrieved_date = TODAY;
      factsTouched = true;
    }

    if (d.declared_total === 0) {
      // Page now declares zero: the count fact (refreshed above) is the record.
      records.delete(p.id);
      return;
    }

    if (d.cases.length !== d.declared_total) {
      warns.push(`${p.id}: page declares ${d.declared_total} cases but lists ${d.cases.length} case rows (kept verbatim)`);
    }

    records.set(p.id, {
      politician_id: p.id,
      declared_total: d.declared_total,
      charges: d.charges,
      cases: d.cases,
      source_url: fact.source_url,
      source_name: fact.source_name,
      retrieved_date: TODAY,
      as_of: fact.as_of,
    });
    written++;
  });

  saveRecords(records);
  if (factsTouched) writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');

  console.log(`\n✓ ${written} detail records written (${records.size} total in criminal_cases.json)`);
  if (drift) console.log(`  ${drift} count facts refreshed from their cited pages`);
  if (unreachable) console.log(`⚠ ${unreachable} pages unreachable - re-run to retry them`);
  if (warns.length) {
    console.log(`\n⚠ ${warns.length} warnings:`);
    for (const w of warns) console.log(`  ${w}`);
  }
  if (skipped.length) {
    console.log(`\n✗ ${skipped.length} members SKIPPED (no record written - review these):`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
