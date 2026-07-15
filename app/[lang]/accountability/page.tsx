import type { Metadata } from 'next';
import { getI18n, type LangParams } from '@/lib/i18n/server';
import { t, tArr } from '@/lib/i18n';
import Breadcrumbs from '@/components/Breadcrumbs';
import Icon, { type IconName } from '@/components/Icon';

export const metadata: Metadata = { title: 'Who is responsible for what?' };

const ROLES: { key: string; icon: IconName; tint: string }[] = [
  { key: 'lokSabha', icon: 'parliament', tint: 'bg-brand-soft text-brand' },
  { key: 'vidhanSabha', icon: 'flag', tint: 'bg-perf-soft text-perf' },
  { key: 'localBody', icon: 'home', tint: 'bg-rating-soft text-rating-ink' },
  { key: 'rajyaSabha', icon: 'layers', tint: 'bg-paper-sink text-ink-soft' },
];

export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default async function AccountabilityPage({ params }: { params: Promise<LangParams> }) {
  const { dict } = await getI18n((await params).lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Breadcrumbs items={[{ label: tr('levels.national'), href: '/' }, { label: tr('nav.accountability') }]} />
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">{tr('accountability.title')}</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-soft">{tr('accountability.intro')}</p>

      <div className="mt-6 space-y-5">
        {ROLES.map(({ key, icon, tint }) => (
          <section key={key} className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
            <div className="flex items-start gap-3">
              <span className={`inline-grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tint}`}>
                <Icon name={icon} size={26} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">{tr(`accountability.roles.${key}.title`)}</h2>
                <p className="text-sm text-ink-faint">{tr(`accountability.roles.${key}.summary`)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Col label={tr('accountability.handlesLabel')} items={tArr(dict, `accountability.roles.${key}.handles`)} icon="parliament" mark="check" />
              <Col label={tr('accountability.accountableLabel')} items={tArr(dict, `accountability.roles.${key}.accountableFor`)} icon="shield" mark="check" />
              <Col label={tr('accountability.notResponsibleLabel')} items={tArr(dict, `accountability.roles.${key}.notResponsible`)} icon="back" mark="arrow" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Col({ label, items, icon, mark }: { label: string; items: string[]; icon: IconName; mark: IconName }) {
  return (
    <div className="rounded-2xl bg-paper-soft p-4">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
        <Icon name={icon} size={14} /> {label}
      </h3>
      <ul className="mt-2.5 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-sm text-ink-soft">
            <Icon name={mark} size={15} className="mt-0.5 shrink-0 text-ink-faint" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
