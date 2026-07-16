'use client';
// "Trending / Top rated / Top performers" switcher inside the home Top-leaders
// card. The two live views (trending activity, top PUBLIC rating) are
// client-fetched from CDN-cached APIs on demand - the home page itself stays a
// static ISR serve, exactly like the VoteWidget pattern on person pages. The
// performers list (verified work record - the SYSTEM axis, deliberately a
// separate tab from the user-vote axis) stays server-rendered: it is passed in
// as children, so it costs no client JS and keeps its SEO.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Avatar, PartyChip } from '@/components/ui';
import { RankBadge } from '@/components/viz';
import Icon, { type IconName } from '@/components/Icon';
import type { TrendingEntry, TopRatedEntry } from '@/lib/types';

type Tab = 'trending' | 'top' | 'performance';
type Remote<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: T[] };

export default function LeadersTabs({ performance }: { performance: React.ReactNode }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('trending');
  const [trending, setTrending] = useState<Remote<TrendingEntry>>({ status: 'idle' });
  const [topRated, setTopRated] = useState<Remote<TopRatedEntry>>({ status: 'idle' });
  const tabRefs = {
    trending: useRef<HTMLButtonElement>(null),
    top: useRef<HTMLButtonElement>(null),
    performance: useRef<HTMLButtonElement>(null),
  };
  const trendingStarted = useRef(false);
  const topStarted = useRef(false);

  // Each list is fetched once, kept for later tab switches. Both endpoints are
  // CDN-cached for 5 minutes, so a retry is cheap too.
  const loadTrending = useCallback(() => {
    trendingStarted.current = true;
    setTrending({ status: 'loading' });
    fetch('/api/trending?limit=10')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setTrending({ status: 'ready', entries: data?.entries ?? [] }))
      .catch(() => setTrending({ status: 'error' }));
  }, []);

  const loadTopRated = useCallback(() => {
    topStarted.current = true;
    setTopRated({ status: 'loading' });
    fetch('/api/ratings?top=10')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setTopRated({ status: 'ready', entries: data?.entries ?? [] }))
      .catch(() => setTopRated({ status: 'error' }));
  }, []);

  // Trending is the default view, so load it on mount; Top rated loads on
  // first open. The refs (not the state) guard the dev StrictMode
  // double-invoke from firing a second fetch.
  useEffect(() => {
    if (!trendingStarted.current) loadTrending();
  }, [loadTrending]);

  const switchTab = (next: Tab) => {
    setTab(next);
    if (next === 'trending' && !trendingStarted.current) loadTrending();
    if (next === 'top' && !topStarted.current) loadTopRated();
  };

  const tabs: { key: Tab; label: string; icon?: IconName }[] = [
    { key: 'trending', label: t('trending.tab'), icon: 'sparkle' },
    { key: 'top', label: t('trending.tabTop'), icon: 'star' },
    { key: 'performance', label: t('trending.tabPerformance') },
  ];

  return (
    <div>
      <div
        role="tablist"
        aria-label={t('home.topTitle')}
        className="mb-3 inline-flex flex-wrap rounded-full bg-paper-sink p-1"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const order = tabs.map((x) => x.key);
          const step = e.key === 'ArrowRight' ? 1 : -1;
          const next = order[(order.indexOf(tab) + step + order.length) % order.length];
          switchTab(next);
          tabRefs[next].current?.focus();
        }}
      >
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            ref={tabRefs[key]}
            type="button"
            role="tab"
            id={`leaders-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`leaders-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => switchTab(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              tab === key ? 'bg-white text-ink shadow-soft' : 'text-ink-faint hover:text-ink'
            }`}
          >
            {icon && <Icon name={icon} size={14} className="mr-1 inline-block -translate-y-px" />}
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="leaders-panel-trending" aria-labelledby="leaders-tab-trending" hidden={tab !== 'trending'}>
        <p className="mb-3 text-sm text-ink-faint">{t('trending.help')}</p>
        {tab === 'trending' && <TrendingPanel state={trending} onRetry={loadTrending} />}
      </div>

      <div role="tabpanel" id="leaders-panel-top" aria-labelledby="leaders-tab-top" hidden={tab !== 'top'}>
        <p className="mb-3 text-sm text-ink-faint">{t('topRated.help')}</p>
        {tab === 'top' && <TopRatedPanel state={topRated} onRetry={loadTopRated} />}
      </div>

      <div role="tabpanel" id="leaders-panel-performance" aria-labelledby="leaders-tab-performance" hidden={tab !== 'performance'}>
        <p className="mb-3 text-sm text-ink-faint">{t('home.topHelp')}</p>
        {performance}
      </div>
    </div>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <ul className="space-y-2" aria-label={label} aria-busy="true">
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="h-[58px] animate-pulse rounded-xl border border-line bg-paper-sink" />
      ))}
    </ul>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
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

function LeaderRow({
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

function TrendingPanel({ state, onRetry }: { state: Remote<TrendingEntry>; onRetry: () => void }) {
  const { t } = useI18n();

  if (state.status === 'idle' || state.status === 'loading') return <ListSkeleton label={t('trending.loading')} />;
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

function TopRatedPanel({ state, onRetry }: { state: Remote<TopRatedEntry>; onRetry: () => void }) {
  const { t } = useI18n();

  if (state.status === 'idle' || state.status === 'loading') return <ListSkeleton label={t('topRated.loading')} />;
  if (state.status === 'error') return <LoadError message={t('topRated.error')} onRetry={onRetry} />;

  if (state.entries.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-paper-soft px-4 py-5 text-sm text-ink-soft">
        <Icon name="star" size={18} className="shrink-0 text-rating-ink" />
        {t('topRated.empty')}
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
                {/* The plain average of votes cast - the Bayesian score only
                    ordered the list server-side and is never printed. */}
                <span className="flex items-center justify-end gap-1 text-sm font-bold text-rating-ink">
                  {e.rating_mean.toFixed(1)}
                  <Icon name="star" size={13} style={{ fill: 'currentColor' }} />
                </span>
                <span className="block text-[11px] text-ink-faint">
                  {e.total_votes === 1 ? t('ranking.voteOne') : t('ranking.votes', { n: e.total_votes })}
                </span>
              </>
            }
          />
        </li>
      ))}
    </ol>
  );
}
