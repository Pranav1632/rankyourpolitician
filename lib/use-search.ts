'use client';
// Client search: fetch the prebuilt static index once (~150KB gzipped), then
// every keystroke is answered locally in <5ms - no server round-trip, no
// Firestore reads, no cold starts.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  prepareIndex,
  searchIndex,
  type PreparedIndex,
  type SearchHits,
  type SearchIndexFile,
} from './search-core';

let indexPromise: Promise<PreparedIndex> | null = null;

export function loadSearchIndex(): Promise<PreparedIndex> {
  if (!indexPromise) {
    indexPromise = fetch('/search-index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`search index: HTTP ${r.status}`);
        return r.json() as Promise<SearchIndexFile>;
      })
      .then(prepareIndex)
      .catch((err) => {
        indexPromise = null; // allow retry on the next call
        throw err;
      });
  }
  return indexPromise;
}

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useSearch(limit = 8) {
  const [status, setStatus] = useState<SearchStatus>('idle');
  const idxRef = useRef<PreparedIndex | null>(null);

  const ensureIndex = useCallback(() => {
    if (idxRef.current) return;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    loadSearchIndex()
      .then((idx) => {
        idxRef.current = idx;
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  // Warm the index during idle time so it's usually ready before typing starts.
  useEffect(() => {
    const warm = () => ensureIndex();
    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(warm, { timeout: 4000 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(warm, 1500);
    return () => clearTimeout(t);
  }, [ensureIndex]);

  const search = useCallback(
    (q: string): SearchHits | null => {
      if (!idxRef.current) {
        ensureIndex();
        return null; // caller shows the loading state
      }
      return searchIndex(idxRef.current, q, limit);
    },
    [ensureIndex, limit],
  );

  return { status, search, ensureIndex };
}

// ---- Recent searches (localStorage, device-only) ---------------------------
const RECENTS_KEY = 'ryp:recent-searches';
const RECENTS_MAX = 6;

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string').slice(0, RECENTS_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  try {
    const cur = getRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase());
    localStorage.setItem(RECENTS_KEY, JSON.stringify([t, ...cur].slice(0, RECENTS_MAX)));
  } catch {
    /* private mode etc. - fine */
  }
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch {
    /* ignore */
  }
}
