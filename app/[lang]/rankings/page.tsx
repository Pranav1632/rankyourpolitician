import type { Metadata } from 'next';
import { getI18n, type LangParams } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import RankingsExplorer from '@/components/RankingsExplorer';
import AdSlot from '@/components/AdSlot';
import { PageHero } from '@/components/ui';

// Daily self-heal only - the page body is dict-only and the table data comes
// from the build-time /rankings.json (live ratings load client-side), so
// hourly regeneration was pure billed-ISR-write waste.
export const revalidate = 86400;
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export async function generateMetadata({ params }: { params: Promise<LangParams> }): Promise<Metadata> {
  const { dict } = await getI18n((await params).lang);
  return {
    title: t(dict, 'ranking.fullTitle'),
    description: t(dict, 'ranking.fullSubtitle'),
  };
}

export default async function RankingsPage({ params }: { params: Promise<LangParams> }) {
  const { dict } = await getI18n((await params).lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  return (
    <>
      <PageHero title={tr('ranking.fullTitle')} subtitle={tr('ranking.fullSubtitle')} />
      <div className="mx-auto max-w-content px-4 py-6">
        {/* RankingsExplorer reads deep-linked filters from window.location on
            mount (no useSearchParams), so no Suspense boundary is needed - the
            old one could wedge on its fallback in dev (see Finder.tsx). The
            filter UI now also prerenders into the static HTML instead of a
            skeleton. */}
        <RankingsExplorer />
        <div className="mt-8">
          <AdSlot />
        </div>
      </div>
    </>
  );
}
