import Link from 'next/link';
import { getI18n, type LangParams } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { getNationalRanking, getStates, getDatasetMeta, getCentralGovernment, getNationalStats } from '@/lib/data';
import { buildStatePaths } from '@/lib/geo';
import SearchBox from '@/components/SearchBox';
import GeoMap, { type GeoMapShape } from '@/components/GeoMap';
import LastUpdated from '@/components/LastUpdated';
import LeadersTabs from '@/components/LeadersTabs';
import { LanguageHint } from '@/components/LanguageSwitcher';
import AdSlot from '@/components/AdSlot';
import HierarchyLadder from '@/components/HierarchyLadder';
import { SectionCard, Avatar, PartyChip, StatPill, Eyebrow } from '@/components/ui';
import { RankBadge } from '@/components/viz';
import { Reveal, CountUp } from '@/components/motion';
import Icon, { type IconName } from '@/components/Icon';
import { Analytics } from '@vercel/analytics/next';

// Daily self-heal only - content changes arrive via deploy or /api/revalidate,
// and every ISR regeneration is a billed write (see README "How data flows").
export const revalidate = 86400;
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default async function HomePage({ params }: { params: Promise<LangParams> }) {
  const { dict } = await getI18n((await params).lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  const [ranking, states, meta, central, stats] = await Promise.all([
    getNationalRanking(),
    getStates(),
    getDatasetMeta(),
    getCentralGovernment(),
    getNationalStats(),
  ]);
  const paths = buildStatePaths();
  const countByCode = new Map(states.map((s) => [s.stateCode, s.count]));
  const maxCount = Math.max(1, ...states.map((s) => s.count));
  const shapes: GeoMapShape[] = paths.map((p) => {
    const count = p.code ? countByCode.get(p.code) : undefined;
    return {
      name: p.name,
      d: p.d,
      cx: p.cx,
      cy: p.cy,
      href: p.code && count ? `/state/${p.code}` : undefined,
      sub: count ? tr('home.mapLeaders', { n: count }) : undefined,
      value: count ? Math.sqrt(count / maxCount) : null,
    };
  });

  const pm = central.find((m) => m.rank === 'PM');
  const topCabinet = central.filter((m) => m.rank === 'Cabinet').slice(0, 5);
  // A small server-rendered teaser - the full leaderboard lives at /rankings
  // (fetched lazily there). Embedding all ~5,400 entries here used to make the
  // home payload multiple MB and route transitions take seconds.
  const topLeaders = (ranking?.entries ?? []).filter((e) => e.performance_percentile != null).slice(0, 5);
  const totalLeaders = ranking?.entries.length ?? 0;
  // One example per rung of the search hierarchy (state → district → person), so
  // the chips also teach what you can search for. Each is verified to return hits.
  const examples = ['Rewa', 'Madhya Pradesh', 'Dharmendra Pradhan'];
  const tiers: { role: string; icon: IconName; tint: string }[] = [
    { role: 'lokSabha', icon: 'parliament', tint: 'bg-brand-soft text-brand' },
    { role: 'vidhanSabha', icon: 'flag', tint: 'bg-perf-soft text-perf' },
    { role: 'localBody', icon: 'home', tint: 'bg-rating-soft text-rating-ink' },
  ];
  // "NOM" groups the President's Rajya Sabha nominees - not a geography, so it
  // gets no state chip (same exclusion as getNationalStats).
  const geoStates = states.filter((s) => s.stateCode !== 'NOM').sort((a, b) => b.count - a.count);
  const exploreLinks: { href: string; icon: IconName; label: string }[] = [
    { href: '/india', icon: 'parliament', label: tr('nav.central') },
    { href: '/hierarchy', icon: 'network', label: tr('nav.hierarchy') },
    { href: '/rankings', icon: 'star', label: tr('ranking.fullTitle') },
    { href: '/accountability', icon: 'people', label: tr('nav.accountability') },
  ];

  return (
    <>
      {/* HERO - search + the living map of India.
          overflow-x-clip (not overflow-hidden) keeps decorative bleed from
          causing horizontal scroll WITHOUT vertically clipping the search
          dropdown, which is absolutely-positioned and overflows this section. */}
      <section className="relative overflow-x-clip border-b border-line/60">
        <div className="mx-auto max-w-content px-4 pb-8 pt-8 sm:pt-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr]">
            <div className="text-center lg:text-left">
              <h1 className="animate-fade-up font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                {tr('home.heroTitle')}
                <br />
                <span className="bg-gradient-to-r from-brand via-brand-deep to-perf bg-clip-text text-transparent">
                  {tr('home.heroTitle2')}
                </span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft animate-fade-up lg:mx-0" style={{ animationDelay: '80ms' }}>
                {tr('home.heroSubtitle')}
              </p>
              {/* relative z-20: the entrance animations create stacking contexts on
                  the sibling stat pills + map; without an explicit z-index here the
                  search dropdown would paint UNDERNEATH them. */}
              <div className="relative z-20 mx-auto mt-7 max-w-xl animate-fade-up lg:mx-0" style={{ animationDelay: '160ms' }}>
                <SearchBox variant="hero" />
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm lg:justify-start">
                  <span className="text-ink-faint">{tr('search.tryLabel')}:</span>
                  {examples.map((ex) => (
                    <Link
                      key={ex}
                      href={`/search?q=${encodeURIComponent(ex)}`}
                      className="pressable rounded-full border border-brand/20 bg-white/90 px-3 py-1 font-medium text-brand backdrop-blur hover:bg-brand-soft"
                    >
                      {ex}
                    </Link>
                  ))}
                </div>
                {/* Language discovery without landing friction: a muted line
                    stating the language count, with native-script one-tap
                    switches. Lives in the hero so nobody has to spot the small
                    header globe to learn the site speaks their language. */}
                <LanguageHint className="mt-4 justify-center lg:justify-start" />
              </div>

              {/* Live counters */}
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 animate-fade-up" style={{ animationDelay: '240ms' }}>
                <StatPill value={<CountUp value={stats.politicians} />} label={tr('home.statLeaders')} tone="brand" />
                <StatPill value={<CountUp value={stats.constituencies} />} label={tr('home.statAreas')} tone="perf" />
                <StatPill value={<CountUp value={stats.districts} />} label={tr('home.statDistricts')} tone="rating" />
                <StatPill value={<CountUp value={stats.states} />} label={tr('home.statStates')} tone="ink" />
              </div>
            </div>

            {/* The map is desktop-only: on phones it added ~600px of scroll
                before any content. Mobile users get it on /india instead. */}
            <div className="hidden animate-map-in lg:block" style={{ animationDelay: '150ms' }}>
              <GeoMap shapes={shapes} w={520} h={560} ariaLabel={tr('home.mapAria')} maxWidthClass="max-w-sm" />
              <p className="mt-2 text-center text-sm text-ink-faint">
                <Icon name="pin" size={14} className="mr-1 inline-block" />
                {tr('home.mapHint')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-content px-4 py-6">
        {/* Org chart of India - how power flows */}
        <Reveal as="section" className="mb-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon name="network" size={22} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-ink">{tr('hierarchy.title')}</h2>
                <p className="text-sm text-ink-faint">{tr('hierarchy.help')}</p>
              </div>
            </div>
            <Link href="/hierarchy" className="pressable inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-brand-deep">
              {tr('hierarchy.fullChart')} <Icon name="arrow" size={15} />
            </Link>
          </div>
          <HierarchyLadder />
        </Reveal>

        {/* Government of India - the top of the ladder */}
        <Reveal as="section" className="mb-8">
          <SectionCard
            title={tr('central.title')}
            subtitle={tr('central.subtitle')}
            icon="parliament"
            aside={
              <Link href="/india" className="shrink-0 whitespace-nowrap text-sm font-semibold text-brand hover:underline">
                {tr('central.seeAll')} →
              </Link>
            }
          >
            {pm ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <Link href={`/person/${pm.politicianId || pm.id}`} className="pressable flex min-w-0 max-w-full items-center gap-3 self-start rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft/70 to-white px-4 py-3 transition hover:shadow-lift sm:self-auto">
                  <Avatar name={pm.name} src={pm.photo_url} size={48} />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-brand">{tr('central.pm')}</span>
                    <span className="block truncate font-bold text-ink">{pm.name}</span>
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <Eyebrow>{tr('central.cabinet')}</Eyebrow>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {topCabinet.map((m) => (
                      <Link
                        key={m.id}
                        href={`/person/${m.politicianId || m.id}`}
                        className="pressable rounded-full border border-line bg-white/85 px-3 py-1 text-xs font-semibold text-ink-soft hover:border-brand/40 hover:text-brand"
                      >
                        {m.name}
                      </Link>
                    ))}
                    <Link href="/india" className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand hover:bg-brand hover:text-white">
                      {tr('central.seeAll')} →
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <Link href="/india" className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line bg-paper-soft px-4 py-5 text-sm text-ink-soft hover:border-brand">
                <span className="flex items-center gap-2"><Icon name="parliament" size={18} className="text-brand" /> {tr('central.comingSoon')}</span>
                <span className="font-semibold text-brand">{tr('central.seeAll')} →</span>
              </Link>
            )}
          </SectionCard>
        </Reveal>

        {/* Finder CTA - guided "who's responsible for what" */}
        <Reveal className="mb-8">
          <Link
            href="/who"
            className="pressable flex items-center gap-4 rounded-3xl border border-accent/30 bg-gradient-to-r from-accent-soft via-white/60 to-brand-soft p-5 shadow-glass transition hover:shadow-lift"
          >
            <span className="inline-grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white shadow-soft">
              <Icon name="megaphone" size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-ink">{tr('finder.title')}</h2>
              <p className="text-sm text-ink-soft">{tr('finder.subtitle')}</p>
            </div>
            <Icon name="arrow" size={22} className="hidden shrink-0 text-accent-ink sm:block" />
          </Link>
        </Reveal>

        {/* State drill-down + top leaders */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.15fr]">
          <Reveal className="h-full">
            {/* Full-height card so the left column visually matches the (tall)
                trending list. Desktop shows EVERY state/UT - the column is tall
                anyway; mobile keeps the top 12 + "+N" so the stacked page stays
                short. A quick-links footer fills the remaining height with the
                main explore destinations instead of dead space. */}
            <SectionCard title={tr('home.exploreTitle')} subtitle={tr('home.exploreHelp')} icon="map" className="flex h-full flex-col">
              <Eyebrow>{tr('home.statesWithData')}</Eyebrow>
              <ul className="mt-2 flex flex-wrap content-start gap-2">
                {geoStates.map((s, i) => (
                  <li key={s.stateCode} className={i >= 12 ? 'hidden lg:block' : undefined}>
                    <Link
                      href={`/state/${s.stateCode}`}
                      className="pressable inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand hover:text-white"
                    >
                      {s.state}
                      <span className="rounded-full bg-white/90 px-1.5 text-xs tabular-nums text-brand-ink">{s.count}</span>
                    </Link>
                  </li>
                ))}
                <li className="lg:hidden">
                  <Link
                    href="/hierarchy"
                    className="pressable inline-flex items-center gap-1 rounded-full border border-brand/30 px-3.5 py-1.5 text-sm font-bold text-brand hover:bg-brand-soft"
                  >
                    +{Math.max(0, geoStates.length - 12)} <Icon name="arrow" size={13} />
                  </Link>
                </li>
              </ul>
              <div className="mt-auto pt-5">
                <Eyebrow icon="compass">{tr('home.moreExplore')}</Eyebrow>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {exploreLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="pressable flex items-center gap-2 rounded-xl border border-line bg-white/85 px-3 py-2.5 text-sm font-semibold text-ink-soft hover:border-brand/40 hover:text-brand"
                    >
                      <Icon name={l.icon} size={16} className="shrink-0 text-brand" />
                      <span className="truncate">{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </SectionCard>
          </Reveal>

          <Reveal delay={90}>
            {/* Three views of the same card: "Trending" (default - recent
                rating activity) and "Top rated" (highest public rating) are
                client-fetched so the page stays static while the lists stay
                fresh; "Top performers" (this server-rendered list - the
                verified work record, a deliberately separate axis from user
                votes) is baked into the ISR page. */}
            <SectionCard title={tr('home.topTitle')} icon="star" aside={<LastUpdated date={meta.lastUpdated} />}>
              <LeadersTabs
                performance={
                  topLeaders.length > 0 ? (
                    <>
                      <ol className="space-y-2">
                        {topLeaders.map((e, i) => (
                          <li key={e.politician_id}>
                            <Link
                              href={`/person/${e.politician_id}`}
                              className="pressable flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 transition hover:border-brand/40 hover:shadow-lift"
                            >
                              <RankBadge rank={i + 1} />
                              <Avatar name={e.name} src={e.photo_url} size={40} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2">
                                  <span className="truncate text-sm font-bold text-ink">{e.name}</span>
                                  <PartyChip party={e.party} />
                                </div>
                                <p className="truncate text-xs text-ink-faint">
                                  {e.constituencyName}, {e.state}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-perf-soft px-2.5 py-1 text-xs font-bold text-perf">
                                {tr('ranking.topShort', { n: Math.max(1, Math.round(100 - (e.performance_percentile ?? 0))) })}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ol>
                      <Link
                        href="/rankings"
                        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft/60"
                      >
                        {tr('ranking.seeAllCount', { n: totalLeaders })} <Icon name="arrow" size={14} />
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-ink-faint">{tr('search.noResults')}</p>
                  )
                }
              />
            </SectionCard>
          </Reveal>
        </div>

        {/* Who does what */}
        <Reveal as="section" className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon name="info" size={22} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-ink">{tr('home.tiersTitle')}</h2>
              <p className="text-sm text-ink-faint">{tr('home.tiersHelp')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tiers.map(({ role, icon, tint }, i) => (
              <Reveal key={role} delay={i * 80}>
                <Link
                  href="/accountability"
                  className="group pressable flex h-full items-center gap-3 rounded-2xl p-3.5 glass transition hover:shadow-lift"
                >
                  <span className={`inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint}`}>
                    <Icon name={icon} size={22} />
                  </span>
                  <span className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-ink">{tr(`accountability.roles.${role}.title`)}</h3>
                    <p className="line-clamp-2 text-xs text-ink-soft">{tr(`accountability.roles.${role}.oneLine`)}</p>
                  </span>
                  <Icon name="arrow" size={15} className="ml-auto shrink-0 text-brand transition group-hover:translate-x-0.5" />
                </Link>
              </Reveal>
            ))}
          </div>
        </Reveal>

        <div className="mt-8">
          <AdSlot />
        </div>
      </div>
      {/* Web analytics only on the landing page, to stay within the free
          analytics-events budget (not mounted in the root layout). */}
      <Analytics />
    </>
  );
}
