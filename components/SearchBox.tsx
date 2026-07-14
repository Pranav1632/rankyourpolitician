'use client';
// Instant search: results come from the prebuilt local index (see
// lib/use-search.ts), so there is no network wait after the first load.
// Full combobox keyboard support + visible loading / empty states.
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { useSearch, addRecentSearch, getRecentSearches, clearRecentSearches } from '@/lib/use-search';
import type { SearchHits } from '@/lib/search-core';
import { norm } from '@/lib/search-core';
import Icon, { type IconName } from './Icon';
import { clsx } from 'clsx';

interface FlatRow {
  href: string;
  title: string;
  sub?: string;
  icon: IconName;
  group: string;
}

function flatten(hits: SearchHits, labels: Record<string, string>): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const p of hits.people) {
    rows.push({
      href: `/person/${p.id}`,
      title: p.name,
      sub: [p.role, p.place, p.state].filter(Boolean).join(' · ') + (p.party ? ` · ${p.party}` : ''),
      icon: 'people',
      group: labels.people,
    });
  }
  for (const a of hits.areas) {
    rows.push({
      href: `/area/${a.id}`,
      title: a.name,
      sub: `${a.type === 'PC' ? labels.pc : labels.ac} · ${a.state}`,
      icon: 'pin',
      group: labels.areas,
    });
  }
  for (const d of hits.districts) {
    rows.push({ href: d.href, title: d.district, sub: d.state, icon: 'map', group: labels.districts });
  }
  for (const s of hits.states) {
    rows.push({ href: `/state/${s.stateCode}`, title: s.state, icon: 'flag', group: labels.states });
  }
  return rows;
}

/** Bold the first query-token match inside a result line. */
function Highlight({ text, q }: { text: string; q: string }) {
  const tokens = norm(q).split(' ').filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;
  const nText = norm(text);
  let start = -1;
  let len = 0;
  for (const tok of tokens) {
    const i = nText.indexOf(tok);
    if (i !== -1) {
      start = i;
      len = tok.length;
      break;
    }
  }
  if (start === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-brand-soft px-0.5 text-brand-ink">{text.slice(start, start + len)}</mark>
      {text.slice(start + len)}
    </>
  );
}

export default function SearchBox({ variant = 'header' }: { variant?: 'header' | 'hero' }) {
  const { t } = useI18n();
  const router = useRouter();
  const { status, search, ensureIndex } = useSearch(5);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `search-list-${variant}`;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const labels = useMemo(
    () => ({
      people: t('search.groups.politicians'),
      areas: t('search.groups.constituencies'),
      districts: t('search.groups.districts'),
      states: t('search.groups.states'),
      pc: t('search.pcShort'),
      ac: t('search.acShort'),
    }),
    [t],
  );

  const hits = q.trim() && status === 'ready' ? search(q) : null;
  const rows = useMemo(() => (hits ? flatten(hits, labels) : []), [hits, labels]);
  const showLoading = q.trim().length > 0 && status !== 'ready' && status !== 'error';

  // Keep the highlighted row in range when results change.
  useEffect(() => {
    setCursor((c) => (rows.length === 0 ? -1 : Math.min(c, rows.length - 1)));
  }, [rows.length]);

  const go = useCallback(
    (href: string) => {
      addRecentSearch(q);
      setOpen(false);
      setCursor(-1);
      router.push(href);
    },
    [q, router],
  );

  function onFocus() {
    ensureIndex();
    setRecents(getRecentSearches());
    setOpen(true);
  }

  function onChange(value: string) {
    setQ(value);
    setOpen(true);
    setCursor(-1);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cursor >= 0 && rows[cursor]) {
      go(rows[cursor].href);
      return;
    }
    if (q.trim()) {
      addRecentSearch(q);
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  // Text-entry fields are always SOLID — you read and type in them, so glass
  // translucency never applies here (this is the "search box too transparent" fix).
  const box =
    variant === 'hero'
      ? 'w-full rounded-2xl border-2 border-brand/25 bg-white px-5 py-4 text-lg text-ink shadow-glass placeholder:text-ink-faint focus:border-brand'
      : 'w-full rounded-full border border-line bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand';

  const showRecents = open && !q.trim() && recents.length > 0;
  const showPanel = open && (q.trim() || showRecents);

  return (
    <div className="relative w-full" ref={ref}>
      <form onSubmit={submit} role="search">
        <label htmlFor={`search-${variant}`} className="sr-only">
          {t('search.placeholder')}
        </label>
        <div className="relative">
          <input
            id={`search-${variant}`}
            ref={inputRef}
            type="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={showPanel ? true : false}
            aria-controls={listId}
            aria-activedescendant={cursor >= 0 ? `${listId}-opt-${cursor}` : undefined}
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            className={`${box} pr-10 outline-none transition-shadow duration-300 focus:shadow-glow`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {showLoading ? (
              <span
                className="block h-5 w-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
                role="status"
                aria-label={t('common.loading')}
              />
            ) : (
              <button type="submit" aria-label={t('search.button')} className="text-ink-faint hover:text-brand">
                <Icon name="search" size={20} />
              </button>
            )}
          </span>
        </div>
      </form>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="glass-overlay absolute left-0 right-0 z-40 mt-2 max-h-[26rem] overflow-auto rounded-2xl p-1.5 animate-scale-in origin-top"
        >
          {showRecents && (
            <div className="py-1">
              <div className="flex items-center justify-between px-3 pb-1 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t('search.recent')}</p>
                <button
                  type="button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecents([]);
                  }}
                  className="text-[11px] font-semibold text-brand hover:underline"
                >
                  {t('search.clear')}
                </button>
              </div>
              {recents.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setQ(r);
                    inputRef.current?.focus();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-brand-soft/60"
                >
                  <Icon name="clock" size={15} className="text-ink-faint" /> {r}
                </button>
              ))}
            </div>
          )}

          {showLoading && (
            <div className="space-y-2 p-3" aria-hidden="true">
              <p className="px-1 pb-1 text-xs text-ink-faint">{t('search.loadingIndex')}</p>
              <div className="skeleton h-9 w-full" />
              <div className="skeleton h-9 w-11/12" />
              <div className="skeleton h-9 w-4/5" />
            </div>
          )}

          {status === 'error' && q.trim() && (
            <p className="px-3 py-3 text-sm text-ink-faint">{t('search.error')}</p>
          )}

          {hits && hits.total === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-medium text-ink-soft">{t('search.noResults')}</p>
              <p className="mt-1 text-xs text-ink-faint">{t('search.hint')}</p>
            </div>
          )}

          {rows.length > 0 && (
            <ul>
              {rows.map((row, i) => {
                const firstOfGroup = i === 0 || rows[i - 1].group !== row.group;
                return (
                  <li key={row.href}>
                    {firstOfGroup && (
                      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                        {row.group}
                      </p>
                    )}
                    <Link
                      id={`${listId}-opt-${i}`}
                      role="option"
                      aria-selected={cursor === i}
                      href={row.href}
                      onClick={() => go(row.href)}
                      onMouseEnter={() => setCursor(i)}
                      className={clsx(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2',
                        cursor === i ? 'bg-brand-soft' : 'hover:bg-brand-soft/60',
                      )}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper-sink text-ink-faint">
                        <Icon name={row.icon} size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          <Highlight text={row.title} q={q} />
                        </span>
                        {row.sub && <span className="block truncate text-xs text-ink-faint">{row.sub}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  href={`/search?q=${encodeURIComponent(q.trim())}`}
                  onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
                  className="mt-1 flex items-center justify-center gap-1.5 rounded-xl border-t border-line/60 px-3 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft/60"
                >
                  {t('search.seeAll')} <Icon name="arrow" size={14} />
                </Link>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
