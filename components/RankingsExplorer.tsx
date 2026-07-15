'use client';
// Full national rankings, fetched lazily from the prebuilt /rankings.json -
// nothing here is serialized into the page payload, so the route stays light
// (this is the fix for multi-second navigation to ranking-heavy pages).
import { useEffect, useMemo, useState } from 'react';
import type { RankingEntry } from '@/lib/types';
import { useI18n } from '@/lib/i18n/provider';
import RankingList from './RankingList';

type Row = [string, string, string, string, string, string, string, number | null, number, string?];
interface RankingsFile {
  v: 1;
  builtAt: string;
  formula: string;
  rows: Row[];
}

let filePromise: Promise<RankingsFile> | null = null;
function loadRankings(): Promise<RankingsFile> {
  if (!filePromise) {
    filePromise = fetch('/rankings.json')
      .then((r) => {
        if (!r.ok) throw new Error(`rankings: HTTP ${r.status}`);
        return r.json() as Promise<RankingsFile>;
      })
      .catch((err) => {
        filePromise = null;
        throw err;
      });
  }
  return filePromise;
}

// Live ratings, keyed by person id: [bayesian_mean, raw_mean, n_votes].
// The static rankings.json never carries vote data, so without this merge the
// "sort by rating" view had nothing to sort by and rated leaders sank into an
// alphabetical list of "No ratings yet". CDN-cached 5 min server-side; failure
// degrades to the unrated view instead of blocking the page.
type RatingRows = Record<string, [number, number, number]>;
let ratingsPromise: Promise<RatingRows> | null = null;
function loadRatings(): Promise<RatingRows> {
  if (!ratingsPromise) {
    ratingsPromise = fetch('/api/ratings')
      .then((r) => {
        if (!r.ok) throw new Error(`ratings: HTTP ${r.status}`);
        return r.json() as Promise<{ ratings?: RatingRows }>;
      })
      .then((j) => j.ratings ?? {})
      .catch(() => {
        ratingsPromise = null;
        return {};
      });
  }
  return ratingsPromise;
}

const HOUSE_LABEL: Record<string, string> = {
  LS: 'Lok Sabha (MP)',
  RS: 'Rajya Sabha (MP)',
  VS: 'Vidhan Sabha (MLA)',
  VP: 'Vidhan Parishad (MLC)',
};

export default function RankingsExplorer() {
  const { t } = useI18n();
  const [file, setFile] = useState<RankingsFile | null>(null);
  const [ratings, setRatings] = useState<RatingRows | null>(null);
  const [error, setError] = useState(false);
  const [state, setState] = useState('');
  const [house, setHouse] = useState('');

  useEffect(() => {
    // Deep-linked filters (?state=MH&house=LS) come from window.location, not
    // useSearchParams(): the query is only read ONCE on mount, and
    // useSearchParams forced a Suspense boundary whose streamed reveal can
    // wedge on the fallback forever (React schedules it via
    // requestAnimationFrame, which never fires in hidden/background tabs -
    // dev mode streams every page, so /rankings was untestable in dev).
    // Same idiom as Finder.tsx.
    const q = new URLSearchParams(window.location.search);
    setState(q.get('state') || '');
    setHouse(q.get('house') || '');
    loadRankings().then(setFile).catch(() => setError(true));
    loadRatings().then(setRatings); // never rejects - degrades to {}
  }, []);

  const states = useMemo(() => {
    if (!file) return [] as [string, string][];
    const m = new Map<string, string>();
    for (const r of file.rows) if (r[5] && r[4]) m.set(r[5], r[4]);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [file]);

  const entries = useMemo(() => {
    if (!file) return [] as RankingEntry[];
    const out: RankingEntry[] = [];
    for (const r of file.rows) {
      if (state && r[5] !== state) continue;
      if (house && r[6] !== house) continue;
      // The prebuilt payload carries no vote data; live ratings are merged in
      // from /api/ratings so unrated leaders sort to the end, never the top.
      const live = ratings?.[r[0]];
      out.push({
        politician_id: r[0],
        name: r[1],
        party: r[2],
        constituencyName: r[3],
        state: r[4],
        stateCode: r[5],
        performance_percentile: r[7],
        performance_cohort: HOUSE_LABEL[r[6]] || r[6],
        metrics_used: r[8],
        sentiment_mean: live ? live[0] : null,
        sentiment_raw_mean: live ? live[1] : null,
        sentiment_votes: live ? live[2] : 0,
        photo_url: r[9],
      });
    }
    return out;
  }, [file, ratings, state, house]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          {t('ranking.filterState')}
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="">{t('ranking.allStates')}</option>
            {states.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          {t('ranking.filterHouse')}
          <select
            value={house}
            onChange={(e) => setHouse(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="">{t('ranking.allHouses')}</option>
            {Object.entries(HOUSE_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-ink-faint">{t('search.error')}</p>}
      {!file && !error && (
        <div className="space-y-2.5" aria-hidden="true">
          <p className="text-xs text-ink-faint">{t('ranking.loading')}</p>
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-11/12" />
        </div>
      )}
      {file && <RankingList entries={entries} />}
    </div>
  );
}
