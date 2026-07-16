import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getPerson, getAllPersonIds, getPersonSentiment, officialPersonId, type PersonView } from '@/lib/data';
import { getI18n } from '@/lib/i18n/server';
import { DEFAULT_LOCALE } from '@/lib/i18n/locales';
import { t } from '@/lib/i18n';
import { roleKeyForHouse, RECORD_GROUPS } from '@/lib/roles';
import { portfolioMandate } from '@/lib/portfolios';
import { ROLE_ACCOUNTABILITY, ROLE_FOR_HOUSE, type RoleAccountability } from '@/lib/role-accountability';
import { roleGlance } from '@/lib/role-glance';
import { OFFICE_META, CPGRAMS_URL } from '@/lib/offices';
import { ESCALATION_CHAINS, OFFICE_CHAIN_POSITION } from '@/lib/escalation';
import EscalationChain from '@/components/EscalationChain';
import { profileLastUpdated, formatDate } from '@/lib/format';
import { PERF_METRIC_META, type PerfMetric, type Fact, type House } from '@/lib/types';
import Breadcrumbs from '@/components/Breadcrumbs';
import { buildSpotMap } from '@/lib/geo-constituencies';
import SpotMiniMap from '@/components/SpotMiniMap';
import { Avatar, PartyChip, Chip } from '@/components/ui';
import { ScoreRing, StatTile } from '@/components/viz';
import Icon, { type IconName } from '@/components/Icon';
import LastUpdated from '@/components/LastUpdated';
import VoteWidget from '@/components/VoteWidget';
import AdSlot from '@/components/AdSlot';
import DeclaredCases from '@/components/DeclaredCases';

// Weekly self-heal only. Profile facts change via deploy or /api/revalidate, and
// the one fast-moving input - live vote numbers - is re-fetched client-side by
// VoteWidget on mount, so regenerating this HTML on a timer buys nothing while
// billing an ISR write per visited page per cycle. At revalidate=86400 the ~10.6k
// crawlable long-tail pages re-rendered once a day under crawler traffic and were
// ~80% of the ISR-writes bill; weekly matches the sitemap's declared cadence.
// See README "How data flows".
export const revalidate = 604800;

const METRIC_ICON: Record<PerfMetric, IconName> = {
  attendance_pct: 'calendar',
  questions_asked: 'megaphone',
  debates_participated: 'people',
  private_member_bills: 'law',
  mplads_utilisation_pct: 'wallet',
};
const FIELD_ICON: Record<string, IconName> = {
  assets_total: 'wallet',
  liabilities_total: 'briefcase',
  criminal_cases_declared: 'scales',
  education: 'cap',
  profession: 'briefcase',
  age: 'calendar',
};
const shortValue = (v: string) => v.split('(')[0].trim();
const leadNumber = (v: string) => v.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? v.split(' ')[0];

// English variants only (~5.4k pages): every locale × person would be a
// 124k-page build. Other locales are rendered on first request + ISR-cached.
export async function generateStaticParams() {
  return (await getAllPersonIds()).map((id) => ({ lang: DEFAULT_LOCALE, id }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const res = await getPerson(id);
  // Alias ids (old slugs) redirect in the page component; canonicalise their
  // metadata to the target so the alias URL never claims to be the real one.
  if (res?.redirectTo) return { alternates: { canonical: `/person/${res.redirectTo}` } };
  const p = res?.person;
  if (!p) return { title: 'Not found' };
  return {
    title: `${p.name}${p.constituency ? ` - ${p.constituency}` : ''}`,
    description: p.neutral_summary,
    // The clean locale-less URL is the canonical for every /{locale}/... variant.
    // Locale is cookie-picked (middleware rewrite), so prefixed variants are
    // crawlable duplicates, not reachable translations. This tag consolidates
    // the still-crawlable ones (/en/... and the clean URL itself); the other 22
    // prefixes are robots-blocked outright, which stops the crawl spend but
    // also hides these tags from crawlers (see app/robots.ts).
    alternates: { canonical: `/person/${id}` },
  };
}

export default async function PersonPage({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params;
  const res = await getPerson(id);
  if (!res) notFound();
  if (res.redirectTo) redirect(`/person/${res.redirectTo}`);
  const person = res.person!;
  const { dict, locale } = await getI18n(lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  if (person.kind === 'official') return <OfficialProfile p={person} tr={tr} locale={locale} />;

  // ---- Elected person (MP and/or minister) --------------------------------
  const sentiment = await getPersonSentiment(id);
  const roleKey = roleKeyForHouse((person.house as House) || 'Lok Sabha');
  const updated = profileLastUpdated({ facts: person.facts } as any);
  const factByType = new Map<string, Fact>();
  for (const f of person.facts) if (!factByType.has(f.field_type)) factByType.set(f.field_type, f);
  // Parliament publishes attendance/questions/debates, so for an MP all three
  // tiles ALWAYS render - with the value, an "exempt" state (ministers and
  // presiding officers, for whom the house keeps no record), or an explicit
  // "unavailable". Missing is shown as missing, never as 0 and never hidden.
  const isMP = person.house === 'Lok Sabha' || person.house === 'Rajya Sabha';
  const CORE_METRICS: PerfMetric[] = ['attendance_pct', 'questions_asked', 'debates_participated'];
  const withValue = (Object.keys(person.metrics) as PerfMetric[]).filter((m) => person.metrics[m] != null);
  const parliamentaryMetrics = isMP
    ? [...CORE_METRICS, ...withValue.filter((m) => !CORE_METRICS.includes(m))]
    : withValue;
  const fullyExempt = isMP && CORE_METRICS.every((m) => person.metrics_exempt?.[m] != null);

  // Every role this person holds - senior-most first - so accountability reflects
  // ALL their positions (e.g. PM + MP, or Cabinet Minister + MP), not one generic block.
  const rolesHeld: string[] = [];
  if (person.is_pm) rolesHeld.push('pm');
  else if (person.govScope === 'state') {
    rolesHeld.push(person.stateRank === 'CM' ? 'cm' : person.stateRank === 'DyCM' ? 'dyCm' : 'stateCabinet');
  } else if (person.is_minister && person.ministerRank === 'Cabinet') rolesHeld.push('unionCabinet');
  else if (person.is_minister && (person.ministerRank === 'MoS-IC' || person.ministerRank === 'MoS')) rolesHeld.push('unionMos');
  const baseRole = ROLE_FOR_HOUSE[person.house || 'Lok Sabha'];
  if (baseRole && !rolesHeld.includes(baseRole)) rolesHeld.push(baseRole);
  const roleContent = rolesHeld.map((rk) => ROLE_ACCOUNTABILITY[rk]).filter(Boolean) as RoleAccountability[];
  // Combined glance bullets: senior-most role in full, further roles in their
  // shorter "secondary" form - one merged list, never per-role repetition.
  const glanceBullets = rolesHeld.flatMap((rk, i) => roleGlance(rk, i > 0));

  const crumbs: { label: string; href?: string }[] = [{ label: tr('levels.national'), href: '/' }];
  if (person.stateCode && person.state) crumbs.push({ label: person.state, href: `/state/${person.stateCode}` });
  if (person.constituencyId && person.constituency) crumbs.push({ label: person.constituency, href: `/area/${person.constituencyId}` });
  crumbs.push({ label: person.name });

  // "Where is this seat" mini-map (Lok Sabha / Vidhan Sabha members only).
  const seatType = person.house === 'Lok Sabha' ? 'PC' : person.house === 'Vidhan Sabha' ? 'AC' : null;
  const spot =
    seatType && person.stateCode && person.constituency
      ? buildSpotMap(person.stateCode, seatType, person.constituency, 300)
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <Breadcrumbs items={crumbs} />

      {/* HERO */}
      <div className="glass mt-4 rounded-3xl p-5 sm:p-7 animate-fade-up">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar name={person.name} src={person.photo_url} size={92} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {person.is_pm ? (
                <Chip tone="warn" icon="sparkle">{tr('central.pm')}</Chip>
              ) : person.is_minister ? (
                <Chip tone="warn" icon="sparkle">{person.ministerRankLabel || tr('profile.minister')}</Chip>
              ) : null}
              {person.house === 'Lok Sabha' && <Chip tone="brand" icon="parliament">{tr('profile.yourMp')}</Chip>}
            </div>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink">{person.name}</h1>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {person.party && <PartyChip party={person.party} />}
              {person.constituency && person.constituencyId ? (
                <Link href={`/area/${person.constituencyId}`} className="flex items-center gap-1 text-sm text-brand hover:underline">
                  <Icon name="pin" size={15} /> {person.constituency}{person.state ? `, ${person.state}` : ''}
                </Link>
              ) : person.constituency ? (
                <span className="flex items-center gap-1 text-sm text-ink-faint">
                  <Icon name="pin" size={15} /> {person.constituency}{person.state ? `, ${person.state}` : ''}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-ink-soft">{person.current_position || tr(`accountability.roles.${roleKey}.oneLine`)}</p>
            {updated && <div className="mt-3 flex justify-center sm:justify-start"><LastUpdated date={updated} /></div>}
          </div>
          {spot && (
            <div className="w-36 shrink-0 sm:w-40">
              <SpotMiniMap
                outline={spot.outline}
                spot={spot.spot}
                spotCx={spot.spotCx}
                spotCy={spot.spotCy}
                w={spot.w}
                h={spot.h}
                label={`${person.constituency}, ${person.state}`}
                className="mx-auto h-auto w-full"
              />
              <p className="mt-1 text-center text-[11px] text-ink-faint">{person.constituency}</p>
            </div>
          )}
        </div>
      </div>

      {/* SCORECARDS */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="glass rounded-3xl border-perf/20 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-perf-soft text-perf"><Icon name="shield" size={18} /></span>
              {tr('profile.scorePerformance')}
            </h2>
            <Chip tone="perf">{tr('common.verifiedData')}</Chip>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <ScoreRing
              value={person.performance?.composite_percentile ?? null}
              size={116}
              label={tr('ranking.topLabel')}
              emptyLabel={tr('ranking.noData')}
            />
            <div className="min-w-0">
              {person.performance?.composite_percentile != null ? (
                <>
                  <p className="font-bold text-perf-ink">
                    {tr('ranking.cohortNote', {
                      n: Math.max(1, Math.round(100 - person.performance.composite_percentile)),
                      cohort: person.performance.cohort_label,
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">{tr('ranking.basedOn', { n: person.performance.metrics_used.length })}</p>
                </>
              ) : (
                <p className="text-sm text-ink-faint">{fullyExempt ? tr('profile.presidingExempt') : person.is_minister ? tr('profile.ministerExempt') : tr('profile.performanceInsufficient')}</p>
              )}
              <p className="mt-1 text-sm text-ink-faint">{tr('profile.perfHelp')}</p>
              <Link href="/methodology" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand">{tr('common.howCalculated')} <Icon name="arrow" size={14} /></Link>
            </div>
          </div>
        </div>

        <div className="glass rounded-3xl border-rating/25 p-5" id="rate">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-rating-soft text-rating-ink"><Icon name="star" size={18} /></span>
              {tr('profile.scoreRating')}
            </h2>
            <Chip tone="rating">{tr('common.notVerified')}</Chip>
          </div>
          {/* Rating summary + vote form live in the client widget: the server
              renders the (possibly week-old) numbers into the static HTML, and
              the widget re-fetches the live score on mount. */}
          <VoteWidget politicianId={person.id} initial={{ mean: sentiment.raw_mean, votes: sentiment.n_votes, distribution: sentiment.distribution, confidence: sentiment.confidence }} />
        </div>
      </div>

      {/* About: plain-language summary + party-change note + identity citation */}
      {(person.neutral_summary || person.party_note || person.identity_source) && (
        <section className="mt-5 glass rounded-3xl p-5 sm:p-6">
          <h2 className="text-xl font-bold text-ink">{tr('profile.aboutTitle')}</h2>
          {person.neutral_summary && <p className="mt-2 text-ink-soft">{person.neutral_summary}</p>}
          {person.party_history && person.party_history.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-paper-soft p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <Icon name="layers" size={14} /> {tr('profile.partyHistory')}
              </p>
              <ol className="mt-3 space-y-3">
                {person.party_history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${h.current ? 'bg-brand' : 'bg-line'}`} aria-hidden />
                    <PartyChip party={h.party} />
                    <span className="text-sm text-ink-faint">{h.until ? `${h.from} - ${h.until}` : `${tr('profile.since')} ${h.from}`}</span>
                    {h.current && <Chip tone="brand">{tr('profile.current')}</Chip>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {person.party_note && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-ink">
              <span className="mt-0.5 shrink-0"><Icon name="info" size={16} className="text-rating-ink" /></span>
              <span><span className="font-semibold">{tr('profile.partyUpdate')}:</span> {person.party_note}</span>
            </div>
          )}
          {person.identity_source && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
              <a href={person.identity_source.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">
                <Icon name="link" size={12} /> {tr('common.source')}: {person.identity_source.name}
              </a>
              <span>· {tr('common.lastUpdated')} {formatDate(person.identity_source.retrieved_date, locale)}</span>
            </p>
          )}
        </section>
      )}

      {/* Government role - the portfolios this person runs, with what each covers */}
      {person.portfolios.length > 0 && (
        <section className="mt-5 rounded-3xl border border-brand/20 bg-brand-soft/40 p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink"><Icon name="parliament" size={20} className="text-brand" /> {person.govScope === 'state' ? tr('profile.govRoleTitleState', { state: person.state || '' }) : tr('profile.govRoleTitle')}</h2>
          <p className="mt-1 text-sm text-ink-soft">{tr('profile.govRoleDesc', { rank: person.ministerRankLabel || tr('profile.minister') })}</p>
          {person.is_pm && (
            <p className="mt-2 flex items-start gap-2 rounded-xl bg-white/90 p-3 text-sm text-ink-soft">
              <Icon name="sparkle" size={16} className="mt-0.5 shrink-0 text-brand" />
              {tr('profile.pmRoleNote', { name: person.name })}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {person.portfolios.map((pf) => {
              const mandate = portfolioMandate(pf);
              return (
                <li key={pf} className="rounded-xl bg-white px-4 py-3 shadow-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-brand-ink">
                    <Icon name="check" size={14} className="shrink-0 text-brand" /> {pf}
                  </p>
                  {mandate && <p className="mt-1 pl-5 text-sm text-ink-soft">{mandate}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Accountability - ONE combined, glanceable card across every role held.
          Short bullets (ministry-specific first for ministers); the full
          role-by-role guide is behind a single collapsible. */}
      <section className="mt-5 glass rounded-3xl p-5 sm:p-6">
        <h2 className="text-xl font-bold text-ink">{tr('profile.accountabilityTitle')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{tr('profile.accountabilityGlanceIntro', { name: person.name })}</p>

        <ul className="mt-4 space-y-2">
          {person.portfolios.length > 0 && (
            <li className="flex gap-2.5 rounded-xl border border-brand/25 bg-brand-soft/50 px-3.5 py-2.5 text-sm font-medium text-ink">
              <Icon name="parliament" size={17} className="mt-0.5 shrink-0 text-brand" />
              <span>
                {tr('profile.glanceMinistryLead', {
                  list:
                    person.portfolios.slice(0, 3).join(' · ') +
                    (person.portfolios.length > 3 ? ` +${person.portfolios.length - 3}` : ''),
                })}
              </span>
            </li>
          )}
          {glanceBullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 rounded-xl bg-paper-soft px-3.5 py-2.5 text-sm text-ink-soft">
              <Icon name="check" size={17} className="mt-0.5 shrink-0 text-perf" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <details className="group mt-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-brand">
            <Icon name="chevron" size={15} className="transition group-open:rotate-180" /> {tr('profile.fullGuide')}
          </summary>
          <div className="mt-4 space-y-4">
            {roleContent.map((role) => (
              <RoleAccountabilityCard
                key={role.roleKey}
                role={role}
                labels={{
                  accountable: tr('accountability.accountableLabel'),
                  handles: tr('accountability.handlesLabel'),
                  notResponsible: tr('accountability.notResponsibleLabel'),
                  sources: tr('common.sources'),
                  seeMore: tr('profile.roleSeeMore'),
                }}
              />
            ))}
          </div>
        </details>
        <Link href="/accountability" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">{tr('nav.accountability')} <Icon name="arrow" size={15} /></Link>
      </section>

      {/* Record */}
      <section className="mt-5 glass rounded-3xl p-5 sm:p-6">
        <h2 className="text-xl font-bold text-ink">{tr('profile.recordTitle')}</h2>
        {!person.hasRecord ? (
          <p className="mt-2 text-sm text-ink-faint">{tr('profile.recordComingSoon')}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-faint">{tr('profile.recordSubtitle')}</p>
            {parliamentaryMetrics.length > 0 ? (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('profile.groups.parliamentary')}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {parliamentaryMetrics.map((m) => {
                    const v = person.metrics[m];
                    const exempt = person.metrics_exempt?.[m];
                    if (v != null)
                      return <StatTile key={m} icon={METRIC_ICON[m]} value={`${v}${PERF_METRIC_META[m].unit}`} label={tr(`fields.${m}`)} hint={person.performance?.metric_percentiles[m] != null ? `${tr('ranking.topLabel')} ${person.performance.metric_percentiles[m]}%` : undefined} />;
                    if (exempt)
                      return <StatTile key={m} icon={METRIC_ICON[m]} value={tr('profile.metricExempt')} label={tr(`fields.${m}`)} hint={tr(`profile.exemptReason.${exempt}`)} accent="ink" />;
                    return <StatTile key={m} icon={METRIC_ICON[m]} value={tr('profile.metricNotPublished')} label={tr(`fields.${m}`)} hint={person.house === 'Rajya Sabha' && m === 'debates_participated' ? tr('profile.rsDebatesNotPublished') : undefined} accent="ink" />;
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('profile.groups.parliamentary')}</h3>
                <p className="text-sm text-ink-faint">{tr('profile.stateHouseNoRecords')}</p>
              </div>
            )}
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('profile.groups.affidavit')}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(['assets_total', 'liabilities_total', 'criminal_cases_declared'] as const).map((field) => {
                  const f = factByType.get(field);
                  // The court-cases tile is a click-through: the whole card
                  // jumps to the case-by-case detail section below.
                  if (field === 'criminal_cases_declared' && f) {
                    return (
                      <a key={field} href="#court-cases" className="block rounded-2xl">
                        <StatTile
                          icon={FIELD_ICON[field]}
                          value={leadNumber(f.value)}
                          label={tr(`fields.${field}`)}
                          hint={
                            <span className="inline-flex items-center gap-1 font-semibold text-brand">
                              {tr('profile.cases.seeDetail')} <Icon name="chevron" size={12} />
                            </span>
                          }
                          accent="ink"
                        />
                      </a>
                    );
                  }
                  return <StatTile key={field} icon={FIELD_ICON[field]} value={f ? (field === 'criminal_cases_declared' ? leadNumber(f.value) : shortValue(f.value)) : tr('common.unavailable')} label={tr(`fields.${field}`)} accent="ink" />;
                })}
              </div>
              <p className="mt-2 text-xs text-ink-faint">{tr('profile.affidavitNote')}</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {(['education', 'profession', 'age'] as const).map((field) => {
                const f = factByType.get(field);
                return (
                  <div key={field} className="rounded-xl bg-paper-soft p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-faint"><Icon name={FIELD_ICON[field]} size={14} /> {tr(`fields.${field}`)}</p>
                    <p className="mt-1 text-sm text-ink">{f ? f.value : tr('common.unavailable')}</p>
                  </div>
                );
              })}
            </div>
            <details className="mt-5 rounded-xl border border-line">
              <summary className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-brand">{tr('profile.seeSources')}<Icon name="chevron" size={16} /></summary>
              <dl className="divide-y divide-line border-t border-line">
                {RECORD_GROUPS.flatMap((g) => g.fields).map((field) => {
                  const f = factByType.get(field);
                  if (!f) return null;
                  return (
                    <div key={field} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:justify-between">
                      <dt className="text-sm text-ink-faint sm:w-44 sm:shrink-0">{tr(`fields.${field}`)}</dt>
                      <dd className="flex-1 text-sm text-ink">
                        {f.value}
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                          <a href={f.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline"><Icon name="link" size={12} /> {f.source_name}</a>
                          <span>· {tr('common.lastUpdated')} {formatDate(f.retrieved_date, locale)}</span>
                          {f.as_of && <span>· {tr('common.asOf')} {f.as_of}</span>}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </details>
          </>
        )}
      </section>

      {/* Declared court cases - case-by-case affidavit record (own citation). */}
      <DeclaredCases record={person.criminal_record} fact={factByType.get('criminal_cases_declared')} tr={tr} locale={locale} />

      {/* Areas + right to reply */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {person.districts.length > 0 && (
          <section className="glass rounded-3xl p-5">
            <h2 className="flex items-center gap-2 font-bold text-ink"><Icon name="pin" size={18} className="text-brand" /> {tr('profile.jurisdictionTitle')}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {person.districts.map((d) => (
                <Link key={d} href={`/district/${person.stateCode}/${encodeURIComponent(d)}`} className="rounded-full bg-paper-sink px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-brand-soft hover:text-brand">{d}</Link>
              ))}
            </div>
          </section>
        )}
        <section className="glass rounded-3xl bg-brand-soft/40 p-5">
          <h2 className="flex items-center gap-2 font-bold text-ink"><Icon name="info" size={18} className="text-brand" /> {tr('profile.rightToReplyTitle')}</h2>
          <p className="mt-1 text-sm text-ink-soft">{tr('profile.rightToReplyBody')}</p>
          <Link href={`/grievance?ref=${encodeURIComponent(person.id)}`} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand shadow-soft hover:bg-brand hover:text-white">{tr('profile.rightToReplyCta')} <Icon name="arrow" size={15} /></Link>
        </section>
      </div>

      <div className="mt-5"><AdSlot /></div>
    </div>
  );
}

function OfficialProfile({ p, tr, locale }: { p: PersonView; tr: (k: string, v?: Record<string, string | number>) => string; locale: string }) {
  const ot = p.officeType!;
  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <Breadcrumbs
        items={[
          { label: tr('levels.national'), href: '/' },
          ...(p.stateCode && p.state ? [{ label: p.state, href: `/state/${p.stateCode}` }] : []),
          ...(p.district ? [{ label: p.district, href: `/district/${p.stateCode}/${encodeURIComponent(p.district)}` }] : []),
          { label: p.name },
        ]}
      />

      <div className="mt-4 glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar name={p.name} size={84} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Chip tone="neutral" icon="shield">{tr(`offices.${ot}.label`)}</Chip>
              {p.service && <Chip tone="brand">{p.service}</Chip>}
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{p.name}</h1>
            {p.district && (
              <p className="mt-1 flex items-center justify-center gap-1 text-sm text-ink-faint sm:justify-start">
                <Icon name="pin" size={15} /> {p.district}, {p.state}
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-paper-soft p-3 text-sm text-ink-soft">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-faint" /> {tr('profile.officialInfoOnly')}
        </p>
      </div>

      {/* Role & responsibility */}
      <section className="mt-5 glass rounded-3xl p-5 sm:p-6">
        <h2 className="text-xl font-bold text-ink">{tr('profile.officialRole')}</h2>
        <p className="mt-2 text-ink-soft">{tr(`offices.${ot}.handles`)}</p>
        <div className="mt-3 rounded-xl bg-paper-soft p-3 text-sm">
          <span className="font-semibold text-ink-faint">{tr('finder.escalateLabel')}: </span>
          <span className="text-ink-soft">{tr(`offices.${ot}.escalate`)}</span>
        </div>
      </section>

      {/* Reporting chain - where this office sits and who to escalate to */}
      {OFFICE_CHAIN_POSITION[ot] && (
        <section className="mt-5 glass rounded-3xl p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Icon name="layers" size={20} className="text-brand" /> {tr('officials.chainTitle')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{tr('officials.chainIntro')}</p>
          <div className="mt-4">
            <EscalationChain
              chain={ESCALATION_CHAINS[OFFICE_CHAIN_POSITION[ot]!.chain]}
              highlightRungId={OFFICE_CHAIN_POSITION[ot]!.rungId}
              labels={{
                startHere: tr('escalation.startHere'),
                escalate: tr('escalation.escalate'),
                covers: tr('escalation.covers'),
                thisOffice: tr('escalation.thisOffice'),
                varies: tr('escalation.varies'),
                sources: tr('escalation.sources'),
              }}
            />
          </div>
        </section>
      )}

      {/* Office contact */}
      {(p.office_email || p.office_phone) && (
        <section className="mt-5 glass rounded-3xl p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-bold text-ink"><Icon name="link" size={18} className="text-brand" /> {tr('profile.officialContact')}</h2>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {p.office_email && <a href={`mailto:${p.office_email}`} className="text-brand hover:underline">{p.office_email}</a>}
            {p.office_phone && <span className="text-ink-soft">☎ {p.office_phone}</span>}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
            {p.sources[0] && <a href={p.sources[0][0]} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline">{p.sources[0][1]}</a>}
            {p.as_of && <span>· {tr('officials.verifiedAsOf')} {formatDate(p.as_of, locale)}</span>}
            <Link href={`/grievance?ref=${encodeURIComponent(p.id)}`} className="hover:underline">· {tr('officials.reportIncorrect')}</Link>
          </p>
        </section>
      )}

      <Link href="/who" className="mt-5 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4 shadow-soft hover:shadow-lift">
        <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-white"><Icon name="megaphone" size={22} /></span>
        <span className="font-semibold text-ink">{tr('officials.findCta')}</span>
        <Icon name="arrow" size={20} className="ml-auto text-accent-ink" />
      </Link>

      <div className="mt-5"><AdSlot /></div>
    </div>
  );
}

function RoleAccountabilityCard({
  role,
  defaultOpen,
  labels,
}: {
  role: RoleAccountability;
  defaultOpen?: boolean;
  labels: { accountable: string; handles: string; notResponsible: string; sources: string; seeMore: string };
}) {
  return (
    <div className="rounded-2xl border border-line bg-paper-soft p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon name="parliament" size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold text-ink">{role.title}</h3>
          <p className="mt-0.5 text-sm text-ink-soft">{role.oneLine}</p>
        </div>
      </div>

      {/* The comprehensive accountability list is always visible - this is the point. */}
      <p className="mt-4 flex items-center gap-1.5 text-sm font-bold text-ink">
        <span className="inline-grid h-6 w-6 place-items-center rounded-lg bg-perf-soft text-perf"><Icon name="shield" size={14} /></span>
        {labels.accountable}
      </p>
      <ul className="mt-2 space-y-1.5">
        {role.accountableFor.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-ink-soft">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-perf" />
            <span>{it}</span>
          </li>
        ))}
      </ul>

      <details className="group mt-3" {...(defaultOpen ? { open: true } : {})}>
        <summary className="flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand">
          <Icon name="chevron" size={15} className="transition group-open:rotate-180" /> {labels.seeMore}
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Icon name="parliament" size={14} className="text-brand" /> {labels.handles}</p>
            <ul className="mt-2 space-y-1.5">
              {role.handles.map((it, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink-soft"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-brand" /><span>{it}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Icon name="back" size={14} className="text-ink-faint" /> {labels.notResponsible}</p>
            <ul className="mt-2 space-y-1.5">
              {role.notResponsible.map((it, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink-soft"><Icon name="arrow" size={15} className="mt-0.5 shrink-0 text-ink-faint" /><span>{it}</span></li>
              ))}
            </ul>
          </div>
        </div>
        {role.sources.length > 0 && (
          <p className="mt-3 border-t border-line pt-2 text-xs text-ink-faint">
            <span className="font-semibold">{labels.sources}:</span> {role.sources.join(' · ')}
          </p>
        )}
      </details>
    </div>
  );
}
