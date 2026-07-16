'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { RankingEntry } from '@/lib/types';
import { useI18n } from '@/lib/i18n/provider';
import { Avatar, PartyChip } from './ui';
import { RankBadge, Stars, ScoreRing } from './viz';
import Icon from './Icon';
import Pager from './Pager';

type SortKey = 'performance' | 'rating';

const PAGE_SIZE = 20;

// Live ratings keyed by person id: [bayesian_mean, raw_mean, n_votes]. The
// entries handed to this component carry sentiment from whenever their page
// was last baked (build/ISR/compute time) - often empty, so the "Public
// rating" sort had nothing real to sort by and rated leaders drowned in the
// unranked tail. One CDN-cached fetch (module-memoised, shared by every list
// on the page) replaces that snapshot with the votes actually cast. On fetch
// failure we keep the baked values - stale beats blank.
type RatingRows = Record<string, [number, number, number]>;
let ratingsPromise: Promise<RatingRows | null> | null = null;
function loadRatings(): Promise<RatingRows | null> {
  if (!ratingsPromise) {
    ratingsPromise = fetch('/api/ratings')
      .then((r) => {
        if (!r.ok) throw new Error(`ratings: HTTP ${r.status}`);
        return r.json() as Promise<{ ratings?: RatingRows }>;
      })
      .then((j) => j.ratings ?? {})
      .catch(() => {
        ratingsPromise = null;
        return null;
      });
  }
  return ratingsPromise;
}

export default function RankingList({
  entries,
  limit,
  seeAllHref,
  total,
}: {
  entries: RankingEntry[];
  limit?: number;
  /** Link to the full ranking when `entries` is a capped slice. */
  seeAllHref?: string;
  /** Size of the uncapped list (for the "see all" label). */
  total?: number;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<SortKey>('performance');
  const [page, setPage] = useState(1);
  const [live, setLive] = useState<RatingRows | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRatings().then(setLive); // null on failure - baked values stay
  }, []);

  // Replace the baked sentiment snapshot wholesale with the live aggregates:
  // they are the authority, including "no votes" (a leader absent from the
  // live map has no standing votes, whatever the snapshot said).
  const merged = useMemo(() => {
    if (!live) return entries;
    return entries.map((e) => {
      const l = live[e.politician_id];
      return {
        ...e,
        sentiment_mean: l ? l[0] : null,
        sentiment_raw_mean: l ? l[1] : null,
        sentiment_votes: l ? l[2] : 0,
      };
    });
  }, [entries, live]);

  const sorted = useMemo(() => {
    const arr = [...merged];
    const key = (e: RankingEntry) => (sort === 'performance' ? e.performance_percentile : e.sentiment_mean);
    arr.sort((a, b) => {
      const av = key(a),
        bv = key(b);
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av || a.name.localeCompare(b.name);
    });
    return limit ? arr.slice(0, limit) : arr;
  }, [merged, sort, limit]);

  // Entries WITHOUT a value under the current sort are never given a rank
  // number - an alphabetical tail is not a ranking. They render after a
  // divider, badge-less, so "not enough data" can't be mistaken for "worst".
  const rankedCount = useMemo(() => {
    const key = (e: RankingEntry) => (sort === 'performance' ? e.performance_percentile : e.sentiment_mean);
    return sorted.reduce((n, e) => n + (key(e) != null ? 1 : 0), 0);
  }, [sorted, sort]);

  // Reset to the first page when the sort order or the underlying list changes.
  useEffect(() => setPage(1), [sort, entries]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(1, pageCount));
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = sorted.slice(start, start + PAGE_SIZE);

  const goToPage = (p: number) => {
    setPage(p);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const grandTotal = total ?? entries.length;
  const truncated = seeAllHref && grandTotal > sorted.length;

  return (
    <div>
      <div ref={topRef} className="scroll-mt-20" />
      {/* Sort - friendly segmented control */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-faint">{t('ranking.sortBy')}:</span>
        <div className="inline-flex rounded-full bg-paper-sink p-1 text-sm font-semibold">
          <button
            onClick={() => setSort('performance')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${sort === 'performance' ? 'bg-white text-perf shadow-sm' : 'text-ink-faint'}`}
          >
            <Icon name="shield" size={15} /> {t('ranking.byPerformance')}
          </button>
          <button
            onClick={() => setSort('rating')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${sort === 'rating' ? 'bg-white text-rating-ink shadow-sm' : 'text-ink-faint'}`}
          >
            <Icon name="star" size={15} /> {t('ranking.bySentiment')}
          </button>
        </div>
      </div>

      <ol className="space-y-2.5">
        {visible.map((e, i) => {
          const abs = start + i;
          const isRanked = abs < rankedCount;
          const showDivider = rankedCount > 0 && rankedCount < sorted.length && (abs === rankedCount || (i === 0 && start > rankedCount));
          return (
            <li key={e.politician_id}>
              {showDivider && (
                <p className="mb-2.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {/* The tail means different things per axis: no verified
                      data (performance) vs no votes cast (public rating). */}
                  <Icon name="info" size={14} />{' '}
                  {t(sort === 'performance' ? 'ranking.unrankedHeader' : 'ranking.unratedHeader')}
                </p>
              )}
              <Link
                href={`/person/${e.politician_id}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 transition hover:border-brand/40 hover:shadow-lift sm:gap-4 sm:p-4"
              >
                <RankBadge rank={isRanked ? abs + 1 : null} />
                <Avatar name={e.name} src={e.photo_url} size={52} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold text-ink">{e.name}</span>
                    <PartyChip party={e.party} />
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-faint">
                    <Icon name="pin" size={14} /> {e.constituencyName}, {e.state}
                  </p>
                  {/* Rating + (mobile) performance shown inline */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {/* Show the plain average of votes cast. Sorting uses the
                        shrunk score (below), but printing that here would state a
                        number nobody voted for. */}
                    <span className="flex items-center gap-1.5">
                      <Stars value={e.sentiment_raw_mean} size={15} />
                      <span className="text-xs text-ink-faint">
                        {e.sentiment_raw_mean == null
                          ? t('ranking.noVotes')
                          : `${e.sentiment_raw_mean.toFixed(1)} · ${e.sentiment_votes === 1 ? t('ranking.voteOne') : t('ranking.votes', { n: e.sentiment_votes })}`}
                      </span>
                    </span>
                    {e.performance_percentile != null && (
                      <span className="text-xs font-bold text-perf sm:hidden">
                        {t('ranking.topShort', { n: Math.max(1, Math.round(100 - e.performance_percentile)) })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Performance ring */}
                <div className="hidden shrink-0 text-center sm:block">
                  <ScoreRing
                    value={e.performance_percentile}
                    size={66}
                    label={t('ranking.topLabel')}
                    emptyLabel={t('ranking.noData')}
                  />
                </div>
                <Icon name="chevron" size={18} className="-rotate-90 text-ink-faint" />
              </Link>
            </li>
          );
        })}
      </ol>

      <Pager
        page={safePage}
        pageCount={pageCount}
        onPage={goToPage}
        total={sorted.length}
        pageSize={PAGE_SIZE}
      />

      {truncated && (
        <Link
          href={seeAllHref}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft/60"
        >
          {t('ranking.seeAllCount', { n: grandTotal })} <Icon name="arrow" size={14} />
        </Link>
      )}
    </div>
  );
}
