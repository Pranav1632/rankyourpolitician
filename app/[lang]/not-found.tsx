import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import SearchBox from '@/components/SearchBox';

export default async function NotFound() {
  const { dict } = await getI18n();
  const tr = (k: string) => t(dict, k);
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <h1 className="mt-3 text-xl font-semibold text-ink">{tr('search.noResults')}</h1>
      <div className="mx-auto mt-6 max-w-md">
        <SearchBox variant="header" />
      </div>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
        ← {tr('nav.home')}
      </Link>
    </div>
  );
}
