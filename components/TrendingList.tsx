'use client';
// Shared building blocks for the live leader lists. Extracted from LeadersTabs
// so the state and district pages can mount the same trending panel (via
// GeoTrending) without pulling in the home page's tab machinery.
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Avatar, PartyChip } from '@/components/ui';
import { RankBadge } from '@/components/viz';
import Icon from '@/components/Icon';
import type { TrendingEntry } from '@/lib/types';

export type Remote<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: T[] };

export function ListSkeleton({ label, rows = 10 }: { label: string; rows?: number }) {
  return (
    <ul className="space-y-2" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-[58px] animate-pulse rounded-xl border border-line bg-paper-sink" />
      ))}
    </ul>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper-soft px-4 py-5 text-sm text-ink-soft">
      {message}{' '}
      <button type="button" onClick={onRetry} className="font-semibold text-brand hover:underline">
        {t('trending.retry')}
      </button>
    </div>
  );
}

export function LeaderRow({
  entry,
  rank,
  aside,
}: {
  entry: { politician_id: string; name: string; party?: string; constituencyName?: string; state?: string; photo_url?: string };
  rank: number;
  aside: React.ReactNode;
}) {
  return (
    <Link
      href={`/person/${entry.politician_id}`}
      className="pressable flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 transition hover:border-brand/40 hover:shadow-lift"
    >
      <RankBadge rank={rank} />
      <Avatar name={entry.name} src={entry.photo_url} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="truncate text-sm font-bold text-ink">{entry.name}</span>
          {entry.party && <PartyChip party={entry.party} />}
        </div>
        {(entry.constituencyName || entry.state) && (
          <p className="truncate text-xs text-ink-faint">
            {[entry.constituencyName, entry.state].filter(Boolean).join(', ')}
          </p>
        )}
      </div>
      <span className="shrink-0 text-right">{aside}</span>
    </Link>
  );
}

/** Which way this week's incoming ratings lean vs the leader's own average
 *  (computed server-side, see lib/trending.ts). Colour AND shape encode the
 *  direction - up/down triangles stay readable for colourblind visitors - and
 *  the label spells it out for screen readers. Movement, never a verdict. */
function TrendArrow({ direction }: { direction: 'up' | 'down' }) {
  const { t } = useI18n();
  const label = t(direction === 'up' ? 'trending.risingAria' : 'trending.fallingAria');
  return (
    <span role="img" aria-label={label} title={label} className={direction === 'up' ? 'text-good' : 'text-bad'}>
      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" className="block">
        <path d={direction === 'up' ? 'M6 1.5l5 8h-10l5-8z' : 'M6 10.5l-5-8h10l-5 8z'} fill="currentColor" />
      </svg>
    </span>
  );
}

export function TrendingPanel({
  state,
  onRetry,
  rows = 10,
}: {
  state: Remote<TrendingEntry>;
  onRetry: () => void;
  rows?: number;
}) {
  const { t } = useI18n();

  if (state.status === 'idle' || state.status === 'loading') return <ListSkeleton label={t('trending.loading')} rows={rows} />;
  if (state.status === 'error') return <LoadError message={t('trending.error')} onRetry={onRetry} />;

  if (state.entries.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-paper-soft px-4 py-5 text-sm text-ink-soft">
        <Icon name="sparkle" size={18} className="shrink-0 text-rating-ink" />
        {t('trending.empty')}
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {state.entries.map((e, i) => (
        <li key={e.politician_id}>
          <LeaderRow
            entry={e}
            rank={i + 1}
            aside={
              <>
                {/* The leader's actual rating (all-time average, same number as
                    their profile) - NOT an average of the week's events. */}
                {e.rating_mean != null && (
                  <span className="flex items-center justify-end gap-1 text-sm font-bold text-rating-ink">
                    {e.direction && <TrendArrow direction={e.direction} />}
                    {e.rating_mean.toFixed(1)}
                    <Icon name="star" size={13} style={{ fill: 'currentColor' }} />
                  </span>
                )}
                <span className="block text-[11px] text-ink-faint">
                  {e.recent_votes === 1 ? t('trending.oneThisWeek') : t('trending.thisWeek', { n: e.recent_votes })}
                </span>
              </>
            }
          />
        </li>
      ))}
    </ol>
  );
}
