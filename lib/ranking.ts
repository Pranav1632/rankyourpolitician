// Pure ranking math - shared by the site (display) and the data manager
// (precompute). No I/O here. The two axes are computed INDEPENDENTLY so public
// sentiment can never move the verified-performance number.

import {
  Politician,
  PerfMetric,
  PERF_METRICS,
  PerformanceScore,
  SentimentScore,
  Ranking,
  RankingEntry,
  VoteAggregate,
} from './types';

export const FORMULA_VERSION = 'perf-v2-weighted-percentile';

// Bayesian prior for the 1..5 sentiment scale: pull thin samples toward neutral.
const SENTIMENT_PRIOR_MEAN = 3.0; // neutral
const SENTIMENT_PRIOR_STRENGTH = 10; // "C" - equivalent number of prior votes

// Metrics that ministers/presiding officers are exempt from by convention
// (they do not ask questions / debate in the ordinary way). Excluding them
// avoids both penalising the minister and skewing the cohort distribution.
const MINISTER_EXEMPT: PerfMetric[] = ['questions_asked', 'debates_participated'];

// perf-v2: explicit weights instead of equal-weighting whatever happens to be
// available. Attendance is the most universal duty; questions and debates
// measure active scrutiny of the government; bills/MPLADS reward initiative
// but have patchy source coverage, so they carry less weight. Weights are
// renormalised over the metrics a member is actually scored on.
export const METRIC_WEIGHT: Record<PerfMetric, number> = {
  attendance_pct: 0.35,
  questions_asked: 0.25,
  debates_participated: 0.2,
  private_member_bills: 0.1,
  mplads_utilisation_pct: 0.1,
};

/** perf-v2 coverage rule: a composite needs at least this many scored metrics.
 *  Ministers are exempt from questions/debates, so one metric (attendance) is
 *  enough for them; everyone else needs 2+ so a single number can never make
 *  a rank on its own. Below the floor → composite is null ("not enough data"). */
export function minMetricsRequired(p: Politician): number {
  return p.is_minister ? 1 : 2;
}

/**
 * A metric may only score anyone if this many members of the cohort actually
 * have it.
 *
 * A percentile is a claim about someone's standing AMONG THEIR PEERS, so it is
 * only meaningful when enough peers are measured the same way. Without this
 * floor, a metric that only a handful of members happen to carry (because it
 * came from a source that doesn't cover everyone) still lands a weighted slice
 * of their composite - e.g. 5 of 529 MPs once had private_member_bills, so one
 * of them was shown "top 33%" for a percentile computed against four other
 * people, and it moved their rank against 524 MPs who were never measured on it
 * at all. Sparse data must be shown as a fact, never converted into a standing.
 */
export const MIN_COHORT_FOR_METRIC = 10;

export function tenureBracket(terms?: number): string {
  if (terms == null) return 'tenure: unknown';
  return terms >= 2 ? 'tenure: 2+ terms' : 'tenure: 1st term';
}

export function cohortKey(p: Politician): string {
  return `${p.house} | ${tenureBracket(p.terms_served)}`;
}

export function cohortLabel(p: Politician): string {
  const t = p.terms_served == null ? '' : p.terms_served >= 2 ? ' (2+ terms)' : ' (1st term)';
  return `${p.house}${t}`;
}

/** Metrics this politician is actually scored on (applies minister exemptions). */
function scoredMetricsOf(p: Politician): [PerfMetric, number][] {
  const out: [PerfMetric, number][] = [];
  for (const m of PERF_METRICS) {
    const v = p.metrics[m];
    if (v == null || Number.isNaN(v)) continue;
    if (p.is_minister && MINISTER_EXEMPT.includes(m)) continue;
    out.push([m, v]);
  }
  return out;
}

/** mid-rank percentile; all our metrics are higher-is-better. */
function percentile(values: number[], v: number, higherIsBetter = true): number {
  const n = values.length;
  if (n <= 1) return 50; // single-member cohort → neutral
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  let pct = ((below + 0.5 * equal) / n) * 100;
  if (!higherIsBetter) pct = 100 - pct;
  return Math.round(pct);
}

export function computePerformanceScores(politicians: Politician[]): Map<string, PerformanceScore> {
  const now = new Date().toISOString();
  const byCohort = new Map<string, Politician[]>();
  for (const p of politicians) {
    const k = cohortKey(p);
    (byCohort.get(k) ?? byCohort.set(k, []).get(k)!).push(p);
  }

  const result = new Map<string, PerformanceScore>();
  for (const [ck, members] of byCohort) {
    // Build the cohort value distribution per metric (respecting exemptions).
    const dist: Partial<Record<PerfMetric, number[]>> = {};
    for (const m of PERF_METRICS) {
      const vals: number[] = [];
      for (const p of members) {
        if (p.is_minister && MINISTER_EXEMPT.includes(m)) continue;
        const v = p.metrics[m];
        if (v != null && !Number.isNaN(v)) vals.push(v);
      }
      // Too few peers measured on this metric → it cannot express a standing,
      // so it is excluded from scoring entirely (the value survives as a cited
      // fact on the profile; it just never becomes a percentile or a rank).
      if (vals.length >= MIN_COHORT_FOR_METRIC) dist[m] = vals;
    }

    for (const p of members) {
      const scored = scoredMetricsOf(p);
      const metric_percentiles: Partial<Record<PerfMetric, number>> = {};
      for (const [m, v] of scored) {
        const vals = dist[m];
        if (vals && vals.length) metric_percentiles[m] = percentile(vals, v, true);
      }
      // perf-v2: weighted mean of the metric percentiles, weights renormalised
      // over the metrics actually scored; null when below the coverage floor.
      const used = Object.keys(metric_percentiles) as PerfMetric[];
      let composite: number | null = null;
      if (used.length >= minMetricsRequired(p)) {
        let wSum = 0;
        let acc = 0;
        for (const m of used) {
          const w = METRIC_WEIGHT[m];
          acc += w * metric_percentiles[m]!;
          wSum += w;
        }
        composite = wSum > 0 ? Math.round(acc / wSum) : null;
      }

      result.set(p.id, {
        politician_id: p.id,
        cohort_key: ck,
        cohort_label: cohortLabel(p),
        metric_percentiles,
        composite_percentile: composite,
        metrics_used: Object.keys(metric_percentiles) as PerfMetric[],
        cohort_size: members.length,
        formula_version: FORMULA_VERSION,
        computed_at: now,
      });
    }
  }
  return result;
}

export function computeSentimentScore(
  politicianId: string,
  agg: VoteAggregate | undefined,
  flaggedUnusual = false,
): SentimentScore {
  const now = new Date().toISOString();
  const counts = agg?.counts ?? {};
  const n = agg?.total ?? 0;
  const sum = agg?.sum ?? 0;
  const raw = n > 0 ? sum / n : null;
  const bayes =
    n > 0
      ? (SENTIMENT_PRIOR_STRENGTH * SENTIMENT_PRIOR_MEAN + sum) /
        (SENTIMENT_PRIOR_STRENGTH + n)
      : null;

  // 'none' means literally no votes - it renders as "No ratings yet", which is a
  // false statement next to a rating. A handful of votes is LOW confidence, not
  // absent confidence, so anything from the first vote up is 'low'.
  let confidence: SentimentScore['confidence'] = 'none';
  if (n >= 200) confidence = 'high';
  else if (n >= 50) confidence = 'medium';
  else if (n >= 1) confidence = 'low';

  return {
    politician_id: politicianId,
    bayesian_mean: bayes == null ? null : Math.round(bayes * 100) / 100,
    raw_mean: raw == null ? null : Math.round(raw * 100) / 100,
    n_votes: n,
    distribution: counts,
    confidence,
    flagged_unusual_activity: flaggedUnusual,
    computed_at: now,
  };
}

function toEntry(
  p: Politician,
  perf: Map<string, PerformanceScore>,
  sent: Map<string, SentimentScore>,
): RankingEntry {
  const ps = perf.get(p.id);
  const ss = sent.get(p.id);
  return {
    politician_id: p.id,
    name: p.name,
    party: p.party,
    constituencyName: p.constituencyName,
    state: p.state,
    stateCode: p.stateCode,
    performance_percentile: ps?.composite_percentile ?? null,
    performance_cohort: ps?.cohort_label ?? '',
    metrics_used: ps?.metrics_used.length ?? 0,
    sentiment_mean: ss?.bayesian_mean ?? null,
    sentiment_raw_mean: ss?.raw_mean ?? null,
    sentiment_votes: ss?.n_votes ?? 0,
    photo_url: p.photo_url,
  };
}

/** Default ordering: verified performance percentile desc, nulls last, name tiebreak. */
export function sortByPerformance(entries: RankingEntry[]): RankingEntry[] {
  return [...entries].sort((a, b) => {
    const av = a.performance_percentile;
    const bv = b.performance_percentile;
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (bv !== av) return bv - av;
    return a.name.localeCompare(b.name);
  });
}

/** Builds ranking docs for every geography at all four tiers. */
export function buildRankings(
  politicians: Politician[],
  perf: Map<string, PerformanceScore>,
  sent: Map<string, SentimentScore>,
): Ranking[] {
  const now = new Date().toISOString();
  const active = politicians.filter((p) => p.active);
  const note =
    'Weighted percentile within a comparable cohort (same house + tenure): attendance 35%, questions 25%, debates 20%, bills 10%, MPLADS 10% - renormalised over verified metrics. Members below the data floor (2 metrics; 1 for ministers) are shown as "not enough data", never ranked. See the Methodology page.';

  const rankings: Ranking[] = [];
  const mk = (level: Ranking['level'], geo: string, label: string, ps: Politician[]) => {
    rankings.push({
      level,
      geo,
      label,
      entries: sortByPerformance(ps.map((p) => toEntry(p, perf, sent))),
      computed_at: now,
      note,
    });
  };

  // National
  mk('national', '', 'India', active);

  // State
  const byState = new Map<string, Politician[]>();
  for (const p of active) (byState.get(p.stateCode) ?? byState.set(p.stateCode, []).get(p.stateCode)!).push(p);
  for (const [code, ps] of byState) mk('state', code, ps[0].state, ps);

  // District (a politician appears in each district their constituency covers)
  const byDistrict = new Map<string, { label: string; ps: Politician[] }>();
  for (const p of active) {
    for (const d of p.districts) {
      const key = `${p.stateCode}/${d}`;
      const bucket = byDistrict.get(key) ?? { label: `${d}, ${p.state}`, ps: [] };
      bucket.ps.push(p);
      byDistrict.set(key, bucket);
    }
  }
  for (const [key, { label, ps }] of byDistrict) mk('district', key, label, ps);

  // Constituency ("area")
  const byCons = new Map<string, { label: string; ps: Politician[] }>();
  for (const p of active) {
    const bucket = byCons.get(p.constituencyId) ?? {
      label: `${p.constituencyName} (${p.constituencyType})`,
      ps: [],
    };
    bucket.ps.push(p);
    byCons.set(p.constituencyId, bucket);
  }
  for (const [id, { label, ps }] of byCons) mk('constituency', id, label, ps);

  return rankings;
}
