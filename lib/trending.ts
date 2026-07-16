// Pure trending math - no I/O, mirroring lib/ranking.ts. "Trending" measures
// ATTENTION (how many NEW voters a leader drew recently), never approval:
// ordering uses a time-decayed new-vote count. Inputs are the per-day buckets
// of first-time votes that the vote transaction maintains on each aggregate
// (VoteAggregate.daily); re-votes are never counted, so a person's weekly count
// can never exceed their distinct-voter total.

import type { VoteAggregate } from './types';

/** Only new votes inside this window count toward trending. */
export const TRENDING_WINDOW_DAYS = 7;

/** How long daily buckets are kept on the aggregate doc. Longer than the
 *  window so a stale cached aggregate can still cover a full window. */
export const TRENDING_RETENTION_DAYS = 14;

/** Exponential decay half-life: yesterday's vote is worth ~0.79 of today's,
 *  a vote from 3 days ago 0.5, from 6 days ago 0.25. Recency beats raw bulk. */
export const TRENDING_HALF_LIFE_DAYS = 3;

/** Activity floor: below this many new votes in the window a person is not
 *  "trending" - one drive-by rating must never put someone on the list. */
export const TRENDING_MIN_RECENT_VOTES = 3;

const DAY_MS = 86_400_000;

/** UTC calendar-day key, e.g. "2026-07-15". UTC (not IST) keeps the key
 *  deterministic across regions; the decay curve smooths the boundary. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Copy of `daily` with buckets older than the retention window dropped.
 *  ISO day keys compare lexicographically, so no date parsing is needed.
 *  Always returns a fresh object - never mutates the (cached) input. */
export function pruneDaily(
  daily: Record<string, Record<string, number>> | undefined,
  now: Date,
): Record<string, Record<string, number>> {
  const cutoff = utcDayKey(new Date(now.getTime() - TRENDING_RETENTION_DAYS * DAY_MS));
  const out: Record<string, Record<string, number>> = {};
  for (const [day, counts] of Object.entries(daily ?? {})) {
    if (day >= cutoff) out[day] = counts;
  }
  return out;
}

/** Record one new-vote event on a daily-buckets map (returns a new map). */
export function bumpDaily(
  daily: Record<string, Record<string, number>> | undefined,
  now: Date,
  rating: number,
): Record<string, Record<string, number>> {
  const out = pruneDaily(daily, now);
  const day = utcDayKey(now);
  out[day] = { ...(out[day] ?? {}), [rating]: (out[day]?.[rating] ?? 0) + 1 };
  return out;
}

export interface TrendingSignal {
  politician_id: string;
  /** Time-decayed event count - ordering only, never displayed. */
  score: number;
  recent_votes: number;
  recent_mean: number | null;
}

/** Minimum gap between the week's new-vote mean and the leader's all-time mean
 *  before a direction arrow shows. Below this the movement is noise - showing
 *  an arrow for a 0.1 drift would turn random variation into a verdict. */
export const TREND_DIRECTION_MIN_DELTA = 0.2;

/**
 * Direction of a leader's incoming ratings: 'up' when this week's new votes
 * average above the leader's own all-time mean by at least the threshold,
 * 'down' when below, null when steady. Derived entirely from numbers we
 * already have (the window mean from the daily buckets, the all-time mean from
 * the aggregate) - no extra storage or reads. The baseline CONTAINS the recent
 * votes, which pulls the delta toward 0 as they dominate; the arrow underclaims
 * rather than overclaims, and a leader whose votes are all recent shows none.
 */
export function trendDirection(
  recentMean: number | null,
  overallMean: number | null,
): 'up' | 'down' | null {
  if (recentMean == null || overallMean == null) return null;
  const delta = recentMean - overallMean;
  if (delta >= TREND_DIRECTION_MIN_DELTA) return 'up';
  if (delta <= -TREND_DIRECTION_MIN_DELTA) return 'down';
  return null;
}

/**
 * Trending signals for every aggregate with enough recent activity, strongest
 * first. Deterministic: ties break on raw recent volume, then id, so the list
 * is stable between refreshes.
 */
export function computeTrendingSignals(aggs: Iterable<VoteAggregate>, now = new Date()): TrendingSignal[] {
  const nowDay = Date.parse(utcDayKey(now) + 'T00:00:00Z');
  const out: TrendingSignal[] = [];

  for (const agg of aggs) {
    if (!agg.daily) continue;
    let votes = 0;
    let sum = 0;
    let score = 0;
    for (const [day, counts] of Object.entries(agg.daily)) {
      const t = Date.parse(day + 'T00:00:00Z');
      if (Number.isNaN(t)) continue;
      const age = Math.round((nowDay - t) / DAY_MS);
      if (age < 0 || age >= TRENDING_WINDOW_DAYS) continue;
      const weight = Math.pow(0.5, age / TRENDING_HALF_LIFE_DAYS);
      for (const [r, c] of Object.entries(counts)) {
        const rating = Number(r);
        const count = Number(c);
        if (!Number.isFinite(rating) || !Number.isFinite(count) || count <= 0) continue;
        votes += count;
        sum += rating * count;
        score += count * weight;
      }
    }
    if (votes < TRENDING_MIN_RECENT_VOTES) continue;
    out.push({
      politician_id: agg.politician_id,
      score,
      recent_votes: votes,
      recent_mean: Math.round((sum / votes) * 100) / 100,
    });
  }

  return out.sort(
    (a, b) =>
      b.score - a.score ||
      b.recent_votes - a.recent_votes ||
      a.politician_id.localeCompare(b.politician_id),
  );
}
