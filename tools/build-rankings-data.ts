// Generates the static national-rankings payload (public/rankings.json).
//
// Why: the home page used to serialize EVERY politician (~5,400 entries) into
// its React Server Component payload just to show a leaderboard - multi-MB
// pages and 3-4s route transitions. Instead the full list is precomputed here
// once per build; the /rankings page fetches it lazily (one cached request,
// ~130KB gzipped) and paginates client-side. Pages only embed small slices.
//
// Run: npx tsx tools/build-rankings-data.ts   (wired into `npm run prebuild`)
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import seedPoliticians from '../data/seed/politicians.json';
import { computePerformanceScores, sortByPerformance, FORMULA_VERSION } from '../lib/ranking';
import type { Politician, RankingEntry } from '../lib/types';

// Row shape (positional to keep the file small):
// [id, name, partyShort, constituency, state, stateCode, houseShort,
//  percentile|null, metricsUsed, photo?]
export type RankingsRow = [
  string, string, string, string, string, string, string,
  number | null, number, string?,
];

export interface RankingsFile {
  v: 1;
  builtAt: string;
  formula: string;
  rows: RankingsRow[];
}

function partyShort(party: string): string {
  const m = party.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : party;
}

const HOUSE_SHORT: Record<string, string> = {
  'Lok Sabha': 'LS',
  'Rajya Sabha': 'RS',
  'Vidhan Sabha': 'VS',
  'Vidhan Parishad': 'VP',
};

const politicians = (seedPoliticians as unknown as Politician[]).filter((p) => p.active);
const perf = computePerformanceScores(politicians);

const entries: (RankingEntry & { house: string })[] = politicians.map((p) => {
  const ps = perf.get(p.id);
  return {
    politician_id: p.id,
    name: p.name,
    party: partyShort(p.party),
    constituencyName: p.constituencyName,
    state: p.state,
    stateCode: p.stateCode,
    performance_percentile: ps?.composite_percentile ?? null,
    performance_cohort: ps?.cohort_label ?? '',
    metrics_used: ps?.metrics_used.length ?? 0,
    // Ratings are live-only; this static payload never carries vote data.
    sentiment_mean: null,
    sentiment_raw_mean: null,
    sentiment_votes: 0,
    photo_url: p.photo_url,
    house: HOUSE_SHORT[p.house] || p.house,
  };
});

const rows: RankingsRow[] = sortByPerformance(entries).map((e) => [
  e.politician_id,
  e.name,
  e.party,
  e.constituencyName,
  e.state,
  e.stateCode,
  (e as any).house,
  e.performance_percentile,
  e.metrics_used ?? 0,
  e.photo_url,
]);

const file: RankingsFile = {
  v: 1,
  builtAt: new Date().toISOString().slice(0, 10),
  formula: FORMULA_VERSION,
  rows,
};

const out = JSON.stringify(file);
mkdirSync(join(process.cwd(), 'public'), { recursive: true });
writeFileSync(join(process.cwd(), 'public', 'rankings.json'), out);
const ranked = rows.filter((r) => r[7] != null).length;
console.log(
  `✓ rankings payload: ${rows.length} leaders (${ranked} ranked, ${rows.length - ranked} without enough data) → public/rankings.json (${(out.length / 1024).toFixed(0)} KB raw)`,
);
