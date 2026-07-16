import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStateByCode, getRanking, getConstituenciesInState, getStates, getStateGovernment, getStateView } from '@/lib/data';
import { buildDistrictMap } from '@/lib/geo-districts';
import { getI18n } from '@/lib/i18n/server';
import { DEFAULT_LOCALE } from '@/lib/i18n/locales';
import { t } from '@/lib/i18n';
import Breadcrumbs from '@/components/Breadcrumbs';
import RankingList from '@/components/RankingList';
import LeadersTabs from '@/components/LeadersTabs';
import PagedConstituencies from '@/components/PagedConstituencies';
import StateGovernmentSection from '@/components/StateGovernment';
import AdSlot from '@/components/AdSlot';
import GeoMap, { type GeoMapShape } from '@/components/GeoMap';
import { SectionCard, StatPill, PageHero, Eyebrow } from '@/components/ui';
import { CompositionBar } from '@/components/viz';
import { Reveal, CountUp } from '@/components/motion';
import Icon from '@/components/Icon';

// Weekly self-heal only - content changes arrive via deploy or /api/revalidate,
// and every ISR regeneration is a billed write: at 86400 this long tail re-rendered
// daily under crawler traffic and dominated the ISR-writes bill (see README
// "How data flows").
export const revalidate = 604800;

export async function generateStaticParams() {
  return (await getStates()).map((s) => ({ lang: DEFAULT_LOCALE, state: s.stateCode }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; state: string }> }): Promise<Metadata> {
  const { state } = await params;
  const s = await getStateByCode(state);
  return {
    title: s ? `${s.state} - government, MPs, MLAs & districts` : 'State',
    // Clean URL is the canonical for every /{locale}/... duplicate (see person page).
    alternates: { canonical: `/state/${s ? s.stateCode : state}` },
  };
}

export default async function StatePage({ params }: { params: Promise<{ lang: string; state: string }> }) {
  const { lang, state } = await params;
  const view = await getStateView(state);
  if (!view) notFound();

  const [ranking, constituencies, stateGov] = await Promise.all([
    getRanking('state', state),
    getConstituenciesInState(state),
    getStateGovernment(state),
  ]);
  const { dict } = await getI18n(lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  // District drill-down map - choropleth by number of linked representatives.
  const districtMap = buildDistrictMap(state, 520);
  const countByDistrict = new Map(view.districtCounts.map((d) => [d.district, d.mps + d.mlas]));
  const maxDistrictCount = Math.max(1, ...view.districtCounts.map((d) => d.mps + d.mlas));
  const mapShapes: GeoMapShape[] | null = districtMap
    ? districtMap.shapes.map((s) => {
        const n = countByDistrict.get(s.name) ?? 0;
        return {
          ...s,
          href: n > 0 ? `/district/${state}/${encodeURIComponent(s.name)}` : undefined,
          sub: n > 0 ? tr('state.mapDistrictSub', { n }) : tr('state.mapDistrictEmpty'),
          value: n > 0 ? Math.sqrt(n / maxDistrictCount) : null,
        };
      })
    : null;

  const houseLabel: Record<string, string> = {
    'Lok Sabha': tr('state.houseMps'),
    'Rajya Sabha': tr('state.houseRs'),
    'Vidhan Sabha': tr('state.houseMlas'),
    'Vidhan Parishad': tr('state.houseMlcs'),
  };

  const govLabels = {
    title: tr('stateGov.title', { state: view.state }),
    cm: tr('stateGov.cm'),
    deputyCm: tr('stateGov.deputyCm'),
    cabinet: tr('stateGov.cabinet'),
    mos: tr('stateGov.mos'),
    governor: tr('stateGov.governor'),
    holds: tr('central.holds'),
    presidentsRule: tr('stateGov.presidentsRule'),
    beingVerified: tr('stateGov.beingVerified'),
    verifyNote: tr('stateGov.verifyNote'),
    asOf: tr('common.asOf'),
    sources: tr('common.sources'),
  };

  // --- Cards + column balancing ----------------------------------------------
  // The government roster and the top-leaders list are the two tall blocks, so
  // government anchors the left column and leaders the right. Government height
  // swings by ~1,500px across states (a 5-minister cabinet vs a 44-minister one)
  // and no fixed split can absorb that, so every other card (composition, map,
  // district list, constituencies) drops onto whichever column is currently
  // shorter. Weights are rough rendered-height estimates (px at the
  // two-column width); only their *relative* size decides placement, so
  // exactness does not matter. The government roster groups ministers into a
  // grid, so its height grows ~sqrt(ministers), not linearly (fit to real states).
  const ministerCount = stateGov && stateGov.governmentStatus !== 'presidents_rule' ? stateGov.ministers.length : 0;
  const wGovernment = stateGov ? (ministerCount ? Math.max(220, Math.round(430 * Math.sqrt(ministerCount) - 130)) : 320) : 0;

  const governmentCard =
    stateGov && (stateGov.ministers.length > 0 || stateGov.governmentStatus === 'presidents_rule') ? (
      <Reveal key="government">
        <StateGovernmentSection gov={stateGov} labels={govLabels} />
      </Reveal>
    ) : null;

  const compositionCard = view.assemblyComposition ? (
    <Reveal key="composition">
      <SectionCard title={tr('state.compositionTitle')} subtitle={tr('state.compositionHelp')} icon="people">
        <CompositionBar
          segments={view.assemblyComposition.segments}
          total={view.assemblyComposition.total}
          ariaLabel={tr('state.compositionTitle')}
        />
      </SectionCard>
    </Reveal>
  ) : null;

  const mapCard = mapShapes ? (
    <Reveal key="map">
      <SectionCard title={tr('state.mapTitle')} subtitle={tr('state.mapHelp')} icon="map">
        <GeoMap shapes={mapShapes} w={districtMap!.w} h={districtMap!.h} ariaLabel={tr('state.mapAria', { state: view.state })} maxWidthClass="max-w-lg" />
      </SectionCard>
    </Reveal>
  ) : null;

  const districtListCard = (
    <Reveal key="districts">
      <SectionCard title={tr('levels.district')} icon="layers" subtitle={tr('state.districtsHelp')}>
        <ul className="flex flex-wrap gap-2">
          {view.districtCounts.map((d) => (
            <li key={d.district}>
              <Link
                href={`/district/${state}/${encodeURIComponent(d.district)}`}
                className="pressable inline-flex items-center gap-1.5 rounded-full border border-line bg-white/85 px-3 py-1 text-sm text-ink-soft hover:border-brand hover:text-brand"
              >
                {d.district}
                <span className="rounded-full bg-paper-sink px-1.5 text-xs tabular-nums">{d.mps + d.mlas}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </Reveal>
  );

  const constituenciesCard = (
    <Reveal key="constituencies">
      <SectionCard title={tr('search.groups.constituencies')} icon="pin">
        <PagedConstituencies items={constituencies.map((c) => ({ id: c.id, name: c.name, type: c.type }))} />
      </SectionCard>
    </Reveal>
  );

  // Same card as the home page's Top leaders: a "Trending" tab (scoped to the
  // state, client-fetched only when the card scrolls into view - the page
  // stays a static ISR serve) next to the server-rendered performance list.
  const leadersCard = (
    <Reveal key="leaders">
      <SectionCard title={tr('home.topTitle')} icon="star">
        <LeadersTabs
          scope={{ stateCode: state }}
          trendingHelp={tr('trending.stateHelp', { state: view.state })}
          performance={
            ranking && ranking.entries.length > 0 ? (
              // Top 100 only - the full state list lives on /rankings
              // (keeps this page's payload small and navigation fast).
              <RankingList entries={ranking.entries.slice(0, 100)} seeAllHref={`/rankings?state=${state}`} total={ranking.entries.length} />
            ) : (
              <p className="text-sm text-ink-faint">{tr('search.noResults')}</p>
            )
          }
        />
      </SectionCard>
    </Reveal>
  );

  // Government anchors the left column, leaders the right; every other card
  // (composition, map, district list, constituencies) is split between the two
  // columns by the assignment that makes them closest in height. With only a
  // handful of movable cards this is a cheap brute force over every combination,
  // and each column is *rendered* back in reading order so balancing never
  // scrambles the page. (The ad is excluded - it renders full width below.)
  const movable = [
    ...(compositionCard ? [{ el: compositionCard, w: 210 }] : []),
    ...(mapCard ? [{ el: mapCard, w: 560 }] : []),
    { el: districtListCard, w: 110 + 8 * view.districtCounts.length },
    { el: constituenciesCard, w: 560 },
  ];
  const leadersWeight = ranking && ranking.entries.length > 0 ? 260 + Math.min(ranking.entries.length, 20) * 128 : 140;
  let bestMask = 0;
  let bestDiff = Infinity;
  for (let mask = 0; mask < 1 << movable.length; mask++) {
    let left = wGovernment;
    let right = leadersWeight;
    movable.forEach((c, i) => (mask & (1 << i) ? (left += c.w) : (right += c.w)));
    if (Math.abs(left - right) < bestDiff) {
      bestDiff = Math.abs(left - right);
      bestMask = mask;
    }
  }
  const leftCards = [...(governmentCard ? [governmentCard] : []), ...movable.filter((_, i) => bestMask & (1 << i)).map((c) => c.el)];
  const rightCards = [leadersCard, ...movable.filter((_, i) => !(bestMask & (1 << i))).map((c) => c.el)];

  return (
    <>
      <PageHero
        crumbs={<Breadcrumbs items={[{ label: tr('levels.national'), href: '/' }, { label: view.state }]} />}
        title={view.state}
        subtitle={tr('state.subtitle', { state: view.state })}
        aside={
          <div className="flex flex-wrap gap-2.5">
            {view.byHouse.map((h, i) => (
              <StatPill
                key={h.house}
                value={<CountUp value={h.count} duration={900 + i * 100} />}
                label={houseLabel[h.house] ?? h.house}
                tone={h.house === 'Vidhan Sabha' ? 'perf' : h.house === 'Lok Sabha' ? 'brand' : 'ink'}
              />
            ))}
          </div>
        }
      />

      <div className="mx-auto max-w-content px-4 py-6">
        {/* Columns balanced by estimated height (see the greedy split above):
            government anchors the left, leaders the right, and the geography
            cards fall to the shorter side - otherwise one column ran
            ~1,700-2,500px past the other and left a dead zone. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">{leftCards}</div>
          <div className="space-y-6">{rightCards}</div>
        </div>

        <Reveal className="mt-8">
          <Link href="/hierarchy" className="pressable flex items-center gap-3 rounded-3xl glass p-4 hover:shadow-lift">
            <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="network" size={22} /></span>
            <div className="min-w-0 flex-1">
              <Eyebrow>{tr('nav.hierarchy')}</Eyebrow>
              <p className="text-sm font-semibold text-ink">{tr('state.hierarchyCta', { state: view.state })}</p>
            </div>
            <Icon name="arrow" size={18} className="shrink-0 text-brand" />
          </Link>
        </Reveal>

        {/* Full width, always last - so the ad never lands above real content
            when the two columns stack on mobile. */}
        <div className="mt-6">
          <AdSlot />
        </div>
      </div>
    </>
  );
}
