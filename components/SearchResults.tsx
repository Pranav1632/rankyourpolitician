'use client';
// Full search page â€” same local index as the SearchBox dropdown, richer layout.
// URL-synced (?q=) so results are shareable and the back button works.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { useSearch, addRecentSearch } from '@/lib/use-search';
import type { SearchHits } from '@/lib/search-core';
import { Avatar, SectionCard } from './ui';
import Icon from './Icon';

export default function SearchResults() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const urlQ = params.get('q') || '';
  const [q, setQ] = useState(urlQ);
  const { status, search, ensureIndex } = useSearch(24);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => ensureIndex(), [ensureIndex]);
  useEffect(() => setQ(urlQ), [urlQ]);

  // Keep the URL in sync (replace, debounced) so refresh/share keeps the query.
  function onChange(v: string) {
    setQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.replace(v.trim() ? `/search?q=${encodeURIComponent(v.trim())}` : '/search', { scroll: false });
      if (v.trim().length >= 2) addRecentSearch(v);
    }, 350);
  }

  const hits: SearchHits | null = useMemo(
    () => (q.trim() && status === 'ready' ? search(q) : null),
    [q, status, search],
  );

  return (
    <div>
      <div className="relative mx-auto max-w-2xl">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          className="w-full rounded-2xl border-2 border-brand/25 bg-white px-5 py-4 text-lg text-ink shadow-glass outline-none placeholder:text-ink-faint transition-shadow focus:border-brand focus:shadow-glow"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2">
          {q.trim() && status !== 'ready' && status !== 'error' ? (
            <span
              className="block h-5 w-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
              role="status"
              aria-label={t('common.loading')}
            />
          ) : (
            <Icon name="search" size={22} className="text-ink-faint" />
          )}
        </span>
      </div>

      {!q.trim() && <p className="mt-8 text-center text-ink-faint">{t('search.hint')}</p>}

      {q.trim() && status === 'error' && (
        <p className="mt-8 text-center text-ink-faint">{t('search.error')}</p>
      )}

      {q.trim() && status !== 'ready' && status !== 'error' && (
        <div className="mx-auto mt-8 max-w-2xl space-y-3" aria-hidden="true">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-11/12" />
          <div className="skeleton h-16 w-4/5" />
        </div>
      )}

      {hits && hits.total === 0 && (
        <div className="mt-10 text-center">
          <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-paper-sink text-ink-faint">
            <Icon name="search" size={28} />
          </span>
          <p className="mt-3 font-semibold text-ink">{t('search.noResults')}</p>
          <p className="mt-1 text-sm text-ink-faint">{t('search.hint')}</p>
        </div>
      )}

      {hits && hits.total > 0 && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {hits.people.length > 0 && (
            <SectionCard title={t('search.groups.politicians')} icon="people" className="md:col-span-2">
              <ul className="grid gap-2 sm:grid-cols-2">
                {hits.people.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/person/${p.id}`}
                      className="pressable flex items-center gap-3 rounded-2xl border border-line/70 bg-white/85 p-3 hover:border-brand/40 hover:shadow-soft"
                    >
                      <Avatar name={p.name} size={44} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{p.name}</span>
                        <span className="block truncate text-xs text-ink-faint">
                          {[p.role, p.place, p.state].filter(Boolean).join(' Â· ')}
                          {p.party ? ` Â· ${p.party}` : ''}
                        </span>
                      </span>
                      <Icon name="chevron" size={16} className="ml-auto shrink-0 -rotate-90 text-ink-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {hits.areas.length > 0 && (
            <SectionCard title={t('search.groups.constituencies')} icon="pin">
              <ul className="space-y-1">
                {hits.areas.map((a) => (
                  <li key={a.id}>
                    <Link href={`/area/${a.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-soft/60">
                      <span className="font-medium text-ink">{a.name}</span>
                      <span className="text-xs text-ink-faint">
                        {a.type === 'PC' ? t('search.pcShort') : t('search.acShort')} Â· {a.state}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          <div className="space-y-6">
            {hits.districts.length > 0 && (
              <SectionCard title={t('search.groups.districts')} icon="map">
                <ul className="space-y-1">
                  {hits.districts.map((d) => (
                    <li key={d.href}>
                      <Link href={d.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-soft/60">
                        <span className="font-medium text-ink">{d.district}</span>
                        <span className="text-xs text-ink-faint">{d.state}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
            {hits.states.length > 0 && (
              <SectionCard title={t('search.groups.states')} icon="flag">
                <ul className="flex flex-wrap gap-2">
                  {hits.states.map((s) => (
                    <li key={s.stateCode}>
                      <Link
                        href={`/state/${s.stateCode}`}
                        className="inline-flex rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand hover:text-white"
                      >
                        {s.state}
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
