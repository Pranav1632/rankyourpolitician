import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getI18n, type LangParams } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import SearchResults from '@/components/SearchResults';

// Search runs entirely in the browser against the prebuilt static index -
// no server work per query. noindex: result pages aren't content.
export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default async function SearchPage({ params }: { params: Promise<LangParams> }) {
  const { dict } = await getI18n((await params).lang);
  return (
    <div className="mx-auto max-w-content px-4 py-8">
      <h1 className="text-center font-display text-3xl font-extrabold tracking-tight text-ink">
        {t(dict, 'search.title')}
      </h1>
      <div className="mt-6">
        <Suspense fallback={<div className="skeleton mx-auto h-14 max-w-2xl" />}>
          <SearchResults />
        </Suspense>
      </div>
    </div>
  );
}
