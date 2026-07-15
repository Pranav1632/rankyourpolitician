'use client';
// "Trending / Top rated" switcher inside the home Top-leaders card. Trending
// is the default view, fetched from /api/trending on mount (CDN-cached 5 min)
// - the home page itself stays a static ISR serve, exactly like the
// VoteWidget pattern on person pages. The top list stays server-rendered
// (passed in as children, so it costs no client JS and keeps its SEO).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Avatar, PartyChip } from '@/components/ui';
import { RankBadge } from '@/components/viz';
import Icon from '@/components/Icon';
import type { TrendingEntry } from '@/lib/types';

type Tab = 'top' | 'trending';
type TrendingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: TrendingEntry[] };

export default function LeadersTabs({ top }: { top: React.ReactNode }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('trending');
  const [trending, setTrending] = useState<TrendingState>({ status: 'idle' });
  const topRef = useRef<HTMLButtonElement>(null);
  const trendingRef = useRef<HTMLButtonElement>(null);
  const startedRef = useRef(false);

  // Fetched once, kept for later tab switches. The endpoint is CDN-cached for
  // 5 minutes, so a retry is cheap too.
  const loadTrending = useCallback(() => {
    startedRef.current = true;
    setTrending({ status: 'loading' });
    fetch('/api/trending?limit=5')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setTrending({ status: 'ready', entries: data?.entries ?? [] }))
      .catch(() => setTrending({ status: 'error' }));
  }, []);

  // Trending is the default view, so load it on mount. The ref (not the state)
  // guards the dev StrictMode double-invoke from firing a second fetch.
  useEffect(() => {
    if (!startedRef.current) loadTrending();
  }, [loadTrending]);

  const switchTab = (next: Tab) => {
    setTab(next);
    if (next === 'trending' && !startedRef.current) loadTrending();
  };

  const tabs: { key: Tab; label: string; ref: React.RefObject<HTMLButtonElement | null> }[] = [
    { key: 'trending', label: t('trending.tab'), ref: trendingRef },
    { key: 'top', label: t('trending.tabTop'), ref: topRef },
  ];

  return (
    <div>
      <div
        role="tablist"
        aria-label={t('home.topTitle')}
        className="mb-3 inline-flex rounded-full bg-paper-sink p-1"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const next: Tab = tab === 'top' ? 'trending' : 'top';
          switchTab(next);
          (next === 'top' ? topRef : trendingRef).current?.focus();
        }}
      >
        {tabs.map(({ key, label, ref }) => (
          <button
            key={key}
            ref={ref}
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
            {key === 'trending' && <Icon name="sparkle" size={14} className="mr-1 inline-block -translate-y-px" />}
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="leaders-panel-trending" aria-labelledby="leaders-tab-trending" hidden={tab !== 'trending'}>
        <p className="mb-3 text-sm text-ink-faint">{t('trending.help')}</p>
        {tab === 'trending' && <TrendingPanel state={trending} onRetry={loadTrending} />}
      </div>

      <div role="tabpanel" id="leaders-panel-top" aria-labelledby="leaders-tab-top" hidden={tab !== 'top'}>
        <p className="mb-3 text-sm text-ink-faint">{t('home.topHelp')}</p>
        {top}
      </div>
    </div>
  );
}

function TrendingPanel({ state, onRetry }: { state: TrendingState; onRetry: () => void }) {
  const { t } = useI18n();

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ul className="space-y-2" aria-label={t('trending.loading')} aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="h-[58px] animate-pulse rounded-xl border border-line bg-paper-sink" />
        ))}
      </ul>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-dashed border-line bg-paper-soft px-4 py-5 text-sm text-ink-soft">
        {t('trending.error')}{' '}
        <button type="button" onClick={onRetry} className="font-semibold text-brand hover:underline">
          {t('trending.retry')}
        </button>
      </div>
    );
  }

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
          <Link
            href={`/person/${e.politician_id}`}
            className="pressable flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 transition hover:border-brand/40 hover:shadow-lift"
          >
            <RankBadge rank={i + 1} />
            <Avatar name={e.name} src={e.photo_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="truncate text-sm font-bold text-ink">{e.name}</span>
                {e.party && <PartyChip party={e.party} />}
              </div>
              {(e.constituencyName || e.state) && (
                <p className="truncate text-xs text-ink-faint">
                  {[e.constituencyName, e.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <span className="shrink-0 text-right">
              {e.recent_mean != null && (
                <span className="flex items-center justify-end gap-1 text-sm font-bold text-rating-ink">
                  {e.recent_mean.toFixed(1)}
                  <Icon name="star" size={13} style={{ fill: 'currentColor' }} />
                </span>
              )}
              <span className="block text-[11px] text-ink-faint">
                {e.recent_votes === 1 ? t('trending.oneThisWeek') : t('trending.thisWeek', { n: e.recent_votes })}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
