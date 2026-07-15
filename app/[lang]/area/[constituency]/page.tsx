import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getConstituency, getRanking, getConstituencyView, getIndex } from '@/lib/data';
import { buildSpotMap } from '@/lib/geo-constituencies';
import { getI18n } from '@/lib/i18n/server';
import { DEFAULT_LOCALE } from '@/lib/i18n/locales';
import { t } from '@/lib/i18n';
import Breadcrumbs from '@/components/Breadcrumbs';
import RankingList from '@/components/RankingList';
import AdSlot from '@/components/AdSlot';
import SpotMiniMap from '@/components/SpotMiniMap';
import { SectionCard, Avatar, PartyChip, Chip, PageHero } from '@/components/ui';
import { Reveal } from '@/components/motion';
import Icon from '@/components/Icon';

// Daily self-heal only - content changes arrive via deploy or /api/revalidate,
// and every ISR regeneration is a billed write (see README "How data flows").
export const revalidate = 86400;

// Prebuild every constituency page for English (~4.6k) so first hits are CDN
// cache hits; other locales render on demand and ISR-cache.
export async function generateStaticParams() {
  const idx = await getIndex();
  return idx.constituencies.map((c) => ({ lang: DEFAULT_LOCALE, constituency: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; constituency: string }>;
}): Promise<Metadata> {
  const { constituency } = await params;
  const c = await getConstituency(constituency);
  return { title: c ? `${c.name} - your representative` : 'Constituency' };
}

export default async function AreaPage({ params }: { params: Promise<{ lang: string; constituency: string }> }) {
  const { lang, constituency } = await params;
  const view = await getConstituencyView(constituency);
  if (!view) notFound();
  const c = view.constituency;

  const ranking = await getRanking('constituency', c.id);
  const { dict } = await getI18n(lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  const typeLabel =
    c.type === 'PC' ? tr('area.typePc') : c.type === 'AC' ? tr('area.typeAc') : c.type === 'RS' ? tr('area.typeRs') : tr('area.typeMlc');
  const roleExplainer =
    c.type === 'PC' ? tr('area.explainPc') : c.type === 'AC' ? tr('area.explainAc') : c.type === 'RS' ? tr('area.explainRs') : tr('area.explainMlc');

  const spot = c.type === 'PC' || c.type === 'AC' ? buildSpotMap(c.stateCode, c.type, c.name, 300) : null;

  return (
    <>
      <PageHero
        crumbs={
          <Breadcrumbs
            items={[
              { label: tr('levels.national'), href: '/' },
              { label: c.state, href: `/state/${c.stateCode}` },
              { label: c.name },
            ]}
          />
        }
        chips={
          <>
            <Chip tone="brand" icon="pin">{typeLabel}</Chip>
            <Chip tone="neutral">{c.state}</Chip>
          </>
        }
        title={c.name}
        subtitle={roleExplainer}
      />

      <div className="mx-auto max-w-content px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            {/* The representative(s) - the reason this page exists */}
            <Reveal>
              <SectionCard title={tr('area.repTitle')} subtitle={tr('area.repHelp')} icon="people">
                {view.representatives.length > 0 ? (
                  <div className="space-y-3">
                    {view.representatives.map((p) => (
                      <Link
                        key={p.id}
                        href={`/person/${p.id}`}
                        className="pressable flex items-center gap-4 rounded-3xl border border-brand/20 bg-gradient-to-br from-brand-soft/50 to-white p-4 hover:shadow-lift sm:p-5"
                      >
                        <Avatar name={p.name} src={p.photo_url} size={72} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xl font-extrabold tracking-tight text-ink">{p.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <PartyChip party={p.party} />
                            {p.is_minister && <Chip tone="warn" icon="sparkle">{tr('profile.minister')}</Chip>}
                          </div>
                          <p className="mt-1.5 text-sm text-ink-soft">{p.current_position}</p>
                        </div>
                        <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand sm:flex">
                          {tr('common.viewProfile')} <Icon name="arrow" size={15} />
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-faint">{tr('area.noRep')}</p>
                )}
              </SectionCard>
            </Reveal>

            {ranking && ranking.entries.length > 0 && view.representatives.length > 1 && (
              <Reveal>
                <SectionCard title={tr('home.topTitle')} icon="star">
                  <RankingList entries={ranking.entries} />
                </SectionCard>
              </Reveal>
            )}

            {view.siblings.length > 0 && (
              <Reveal>
                <SectionCard title={tr('area.siblingsTitle')} subtitle={tr('area.siblingsHelp')} icon="grid">
                  <ul className="flex flex-wrap gap-2">
                    {view.siblings.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/area/${s.id}`}
                          className="pressable inline-flex items-center gap-1 rounded-full border border-line bg-white/85 px-3 py-1 text-sm text-ink-soft hover:border-brand hover:text-brand"
                        >
                          {s.name}
                          <span className="text-xs text-ink-faint">{s.type === 'PC' ? tr('search.pcShort') : tr('search.acShort')}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              </Reveal>
            )}
          </div>

          <div className="space-y-6">
            {spot && (
              <Reveal>
                <SectionCard title={tr('area.mapTitle', { state: c.state })} subtitle={tr('area.mapHelp', { state: c.state })} icon="map">
                  <SpotMiniMap
                    outline={spot.outline}
                    spot={spot.spot}
                    spotCx={spot.spotCx}
                    spotCy={spot.spotCy}
                    w={spot.w}
                    h={spot.h}
                    label={tr('area.mapAria', { name: c.name, state: c.state })}
                    className="mx-auto h-auto w-full max-w-[18rem]"
                  />
                </SectionCard>
              </Reveal>
            )}

            {c.districts.length > 0 && (
              <Reveal>
                <SectionCard title={tr('accountability.jurisdictionLabel')} icon="layers" subtitle={tr('area.districtsHelp')}>
                  <div className="flex flex-wrap gap-2">
                    {c.districts.map((d) => (
                      <Link
                        key={d}
                        href={`/district/${c.stateCode}/${encodeURIComponent(d)}`}
                        className="pressable rounded-full border border-line bg-white/85 px-3 py-1 text-sm text-ink-soft hover:border-brand hover:text-brand"
                      >
                        {d}
                      </Link>
                    ))}
                  </div>
                </SectionCard>
              </Reveal>
            )}

            <Reveal>
              <Link href="/who" className="pressable flex items-center gap-3 rounded-3xl glass p-4 hover:shadow-lift">
                <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-white"><Icon name="megaphone" size={22} /></span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{tr('officials.findCta')}</span>
                <Icon name="arrow" size={18} className="shrink-0 text-accent-ink" />
              </Link>
            </Reveal>
            <AdSlot />
          </div>
        </div>
      </div>
    </>
  );
}
