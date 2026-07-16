'use client';
// "Trending / Top rated / Top performers" switcher inside the Top-leaders
// card. The live views (trending activity, top PUBLIC rating) are
// client-fetched from CDN-cached APIs on demand - the page itself stays a
// static ISR serve, exactly like the VoteWidget pattern on person pages. The
// performers list (verified work record - the SYSTEM axis, deliberately a
// separate tab from the user-vote axis) stays server-rendered: it is passed in
// as children, so it costs no client JS and keeps its SEO.
//
// State/district pages mount the same card with `scope`: trending is scoped to
// their leaders (same API, ?state=/&district= params - each scope is its own
// CDN cache key), the Top-rated tab is dropped (it has no scoped endpoint),
// and the trending fetch waits until the card scrolls into view - most visits
// never reach it, and every skipped fetch is a skipped function invocation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { observe } from '@/components/motion';
import Icon, { type IconName } from '@/components/Icon';
import { ListSkeleton, LoadError, LeaderRow, TrendingPanel, type Remote } from '@/components/TrendingList';
import type { TrendingEntry, TopRatedEntry } from '@/lib/types';

type Tab = 'trending' | 'top' | 'performance';

export default function LeadersTabs({
  performance,
  scope,
  trendingHelp,
}: {
  performance: React.ReactNode;
  /** Geo mode: scope trending to one state (2-letter code) or district. */
  scope?: { stateCode: string; district?: string };
  /** Help line for the trending panel - geo pages pass a localised, scoped
   *  variant (they have the display names); defaults to the national one. */
  trendingHelp?: string;
}) {
  const { t } = useI18n();
  const rows = scope ? 5 : 10;
  const [tab, setTab] = useState<Tab>('trending');
  const [trending, setTrending] = useState<Remote<TrendingEntry>>({ status: 'idle' });
  const [topRated, setTopRated] = useState<Remote<TopRatedEntry>>({ status: 'idle' });
  const rootRef = useRef<HTMLDivElement>(null);
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
    const qs = new URLSearchParams({ limit: String(rows) });
    if (scope) {
      qs.set('state', scope.stateCode);
      if (scope.district) qs.set('district', scope.district);
    }
    fetch(`/api/trending?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setTrending({ status: 'ready', entries: data?.entries ?? [] }))
      .catch(() => setTrending({ status: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scope?.stateCode, scope?.district]);

  const loadTopRated = useCallback(() => {
    topStarted.current = true;
    setTopRated({ status: 'loading' });
    fetch('/api/ratings?top=10')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setTopRated({ status: 'ready', entries: data?.entries ?? [] }))
      .catch(() => setTopRated({ status: 'error' }));
  }, []);

  // Trending is the default view. On the home page it loads on mount; in geo
  // mode the fetch is deferred until the card first scrolls into view (the
  // same shared observer the Reveal animations use). The refs (not the state)
  // guard the dev StrictMode double-invoke from firing a second fetch.
  useEffect(() => {
    if (trendingStarted.current) return;
    if (!scope) {
      loadTrending();
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight) {
      loadTrending();
      return;
    }
    return observe(el, () => {
      if (!trendingStarted.current) loadTrending();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTrending]);

  const switchTab = (next: Tab) => {
    setTab(next);
    if (next === 'trending' && !trendingStarted.current) loadTrending();
    if (next === 'top' && !topStarted.current) loadTopRated();
  };

  const tabs: { key: Tab; label: string; icon?: IconName }[] = [
    { key: 'trending', label: t('trending.tab'), icon: 'sparkle' },
    ...(scope ? [] : [{ key: 'top' as Tab, label: t('trending.tabTop'), icon: 'star' as IconName }]),
    { key: 'performance', label: t('trending.tabPerformance') },
  ];

  return (
    <div ref={rootRef}>
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
        <p className="mb-3 text-sm text-ink-faint">{trendingHelp ?? t('trending.help')}</p>
        {tab === 'trending' && <TrendingPanel state={trending} onRetry={loadTrending} rows={rows} />}
      </div>

      {!scope && (
        <div role="tabpanel" id="leaders-panel-top" aria-labelledby="leaders-tab-top" hidden={tab !== 'top'}>
          <p className="mb-3 text-sm text-ink-faint">{t('topRated.help')}</p>
          {tab === 'top' && <TopRatedPanel state={topRated} onRetry={loadTopRated} />}
        </div>
      )}

      <div role="tabpanel" id="leaders-panel-performance" aria-labelledby="leaders-tab-performance" hidden={tab !== 'performance'}>
        <p className="mb-3 text-sm text-ink-faint">{t('home.topHelp')}</p>
        {performance}
      </div>
    </div>
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
