/**
 * Data-manager step: ingest a sourcing-workflow output JSON and emit the seed
 * dataset the site reads. ONLY facts the independent verifier marked CONFIRMED
 * survive. WRONG / UNVERIFIABLE / SOURCE_UNREACHABLE facts are dropped from
 * display (identity is still shown via structured fields when identity was
 * CONFIRMED overall). Every kept fact is stamped with the retrieval date.
 *
 * Usage: npx tsx tools/data-manager/import-workflow-output.ts [path-to-output.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');

const STATE_CODE: Record<string, string> = {
  Goa: 'GA',
  'Himachal Pradesh': 'HP',
};

// Facts shown on profiles (deduped, in this order). Everything else is metadata.
const DISPLAY_ORDER = [
  'education',
  'profession',
  'age',
  'assets_total',
  'liabilities_total',
  'criminal_cases_declared',
  'attendance_pct',
  'questions_asked',
  'debates_participated',
  'private_member_bills',
  'mplads_utilisation_pct',
  'terms_served',
  'previous_positions',
];
const METRIC_FIELDS = [
  'attendance_pct',
  'questions_asked',
  'debates_participated',
  'private_member_bills',
  'mplads_utilisation_pct',
] as const;

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseNumber(v: string): number | null {
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
// Term strings embed election dates ("elected 09-06-2024") so a naive
// first-number parse is wrong. Match term-specific patterns only.
function parseTerms(v: string): number | null {
  const s = String(v).toLowerCase();
  const word = s.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/);
  if (word) return ORDINALS[word[1]];
  const ord = s.match(/(\d+)\s*(?:st|nd|rd|th)\b/); // "6th", "5 th"
  if (ord) return Number(ord[1]);
  const term = s.match(/(\d+)\s*term/); // "5 term"
  if (term) return Number(term[1]);
  const lead = s.match(/^\s*(\d+)\b/); // leading "1 (first term...)"
  if (lead) return Number(lead[1]);
  return null;
}

function main() {
  const inputPath =
    process.argv[2] ||
    resolve(
      process.env.LOCALAPPDATA || ROOT,
      'Temp/claude/C--Users-Vikas-Documents-Rankyourpolician/f0ba3733-3c5e-4ebd-b37f-b1844d97468f/tasks/wjhne77jt.output',
    );
  const doc = JSON.parse(readFileSync(inputPath, 'utf8'));
  const payload = doc.result ?? doc;
  const today: string = payload.today || new Date().toISOString().slice(0, 10);
  const roster: any[] = payload.roster || [];
  const records: any[] = payload.records || [];

  const districtsByConstituency = new Map<string, string[]>();
  for (const r of roster) districtsByConstituency.set(r.constituency, r.districtsCovered || []);

  const politicians: any[] = [];
  const constituencies: any[] = [];
  const constSeen = new Set<string>();
  const report: string[] = [];

  for (const rec of records) {
    const id: any = rec.sourced?.identity;
    const verdict: any = rec.verdict;
    if (!id || !verdict) continue;
    if (verdict.identityVerdict !== 'CONFIRMED') {
      report.push(`SKIP ${id?.name}: identity ${verdict.identityVerdict}`);
      continue;
    }

    const stateCode = STATE_CODE[id.state] || slug(id.state).slice(0, 2).toUpperCase();
    const consName = id.constituency;
    const constituencyId = `pc-${stateCode.toLowerCase()}-${slug(consName)}`;
    const districts = districtsByConstituency.get(consName) || id.districtsCovered || [];

    // Verdict lookup: field_type + source_url -> verdict entry
    const vmap = new Map<string, any>();
    for (const c of verdict.checkedFacts || []) vmap.set(`${c.field_type}|${c.source_url}`, c);

    const confirmed = (rec.sourced.facts || []).filter((f: any) => {
      const c = vmap.get(`${f.field_type}|${f.source_url}`);
      return c && c.verdict === 'CONFIRMED';
    });

    // Build deduped display facts in canonical order.
    const facts: any[] = [];
    for (const field of DISPLAY_ORDER) {
      const f = confirmed.find((x: any) => x.field_type === field);
      if (!f) continue;
      facts.push({
        field_type: f.field_type,
        value: f.value,
        source_url: f.source_url,
        source_name: f.source_name,
        retrieved_date: today,
        ...(f.as_of ? { as_of: f.as_of } : {}),
      });
    }

    // Numeric metrics (only from CONFIRMED facts).
    const metrics: Record<string, number> = {};
    for (const field of METRIC_FIELDS) {
      const f = confirmed.find((x: any) => x.field_type === field);
      if (!f) continue;
      const n = parseNumber(f.value);
      if (n != null) metrics[field] = n;
    }

    const termsFact = confirmed.find((x: any) => x.field_type === 'terms_served');
    const terms = termsFact ? parseTerms(termsFact.value) : null;

    const politicianId = slug(`${consName}-${id.name}`);
    politicians.push({
      id: politicianId,
      name: id.name,
      name_hi: id.name_hi || undefined,
      party: id.party,
      house: 'Lok Sabha',
      state: id.state,
      stateCode,
      constituencyId,
      constituencyName: consName,
      constituencyType: 'PC',
      districts,
      current_position: id.current_position,
      is_minister: Boolean(id.is_minister),
      wikidata_qid: id.wikidata_qid || undefined,
      // Photos deliberately omitted at seed time: Commons "File:" links are HTML
      // pages, not image URLs, and CC-BY images carry an attribution burden.
      // Add later via the data manager with a direct upload.wikimedia.org URL.
      photo_url: undefined,
      neutral_summary: rec.sourced.neutralSummary || undefined,
      metrics,
      facts,
      terms_served: terms ?? undefined,
      active: true,
    });

    if (!constSeen.has(constituencyId)) {
      constSeen.add(constituencyId);
      constituencies.push({
        id: constituencyId,
        type: 'PC',
        name: consName,
        state: id.state,
        stateCode,
        districts,
      });
    }

    report.push(
      `OK  ${id.name} (${consName}, ${stateCode}) - ${facts.length} facts, metrics: ${Object.keys(metrics).join(', ') || 'none (minister/exempt)'}, minister=${Boolean(id.is_minister)}, terms=${terms}`,
    );
  }

  mkdirSync(SEED_DIR, { recursive: true });
  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(politicians, null, 2) + '\n');
  writeFileSync(resolve(SEED_DIR, 'constituencies.json'), JSON.stringify(constituencies, null, 2) + '\n');

  console.log(report.join('\n'));
  console.log(`\nWrote ${politicians.length} politicians, ${constituencies.length} constituencies to ${SEED_DIR}`);
}

main();
