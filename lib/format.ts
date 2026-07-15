// Formatting helpers. Dates are localised where the runtime supports the locale
// (many Eighth-Schedule codes aren't valid Intl locales - we fall back to en-IN).
import type { Politician, PerfMetric } from './types';
import { PERF_METRIC_META } from './types';

export function formatDate(iso: string | undefined, locale = 'en'): string {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-IN', opts).format(d);
  }
}

export function daysSince(iso: string | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

/** Human relative string using the i18n dictionary's `time.*` keys. */
export function relativeTime(
  iso: string | undefined,
  t: (k: string, vars?: Record<string, string | number>) => string,
  locale = 'en',
): string {
  const days = daysSince(iso);
  if (days == null) return '';
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  if (days < 60) return t('time.daysAgo', { n: days });
  return t('time.monthsAgo', { n: Math.round(days / 30) });
}

/** The most recent retrieval date across a politician's facts (profile freshness). */
export function profileLastUpdated(p: Politician): string | undefined {
  const dates = p.facts.map((f) => f.retrieved_date).filter(Boolean).sort();
  return dates[dates.length - 1];
}

/** The most recent retrieval date across the whole dataset (site freshness). */
export function datasetLastUpdated(politicians: Politician[]): string | undefined {
  const all = politicians.flatMap((p) => p.facts.map((f) => f.retrieved_date)).filter(Boolean).sort();
  return all[all.length - 1];
}

export function formatMetricValue(metric: PerfMetric, value: number): string {
  const meta = PERF_METRIC_META[metric];
  const num = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return meta.unit === '%' ? `${num}%` : num;
}

export function initials(name: string): string {
  const parts = name.replace(/^(Dr\.?|Captain|Shri|Smt\.?|Mr\.?|Ms\.?)\s+/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

/** Deterministic, party-neutral avatar tint from a name (never party colours). */
export function avatarTint(seed: string): string {
  const palette = ['#4477aa', '#66ccee', '#228833', '#ccbb44', '#ee8866', '#aa3377', '#777777'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
