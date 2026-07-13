import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getPerson, getAllPersonIds, officialPersonId, type PersonView } from '@/lib/data';
import { getSentiment } from '@/lib/votes';
import { getI18n } from '@/lib/i18n/server';
import { t, tArr } from '@/lib/i18n';
import { roleKeyForHouse, RECORD_GROUPS } from '@/lib/roles';
import { OFFICE_META, CPGRAMS_URL } from '@/lib/offices';
import { profileLastUpdated, formatDate } from '@/lib/format';
import { PERF_METRIC_META, type PerfMetric, type Fact, type House } from '@/lib/types';
import Breadcrumbs from '@/components/Breadcrumbs';
import { Avatar, PartyChip, Chip } from '@/components/ui';
import { ScoreRing, Stars, StatTile } from '@/components/viz';
import Icon, { type IconName } from '@/components/Icon';
import LastUpdated from '@/components/LastUpdated';
import VoteWidget from '@/components/VoteWidget';
import AdSlot from '@/components/AdSlot';

export const revalidate = 300;

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

export async function generateStaticParams() {
  return (await getAllPersonIds()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const res = await getPerson(id);
  const p = res?.person;
  if (!p) return { title: 'Not found' };
  return { title: `${p.name}${p.constituency ? ` — ${p.constituency}` : ''}`, description: p.neutral_summary };
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getPerson(id);
  if (!res) notFound();
  if (res.redirectTo) redirect(`/person/${res.redirectTo}`);
  const person = res.person!;
  const { dict, locale } = await getI18n();
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  if (person.kind === 'official') return <OfficialProfile p={person} tr={tr} locale={locale} />;

  // ---- Elected person (MP and/or minister) --------------------------------
  const sentiment = await getSentiment(id);
  const roleKey = roleKeyForHouse((person.house as House) || 'Lok Sabha');
  const updated = profileLastUpdated({ facts: person.facts } as any);
  const factByType = new Map<string, Fact>();
  for (const f of person.facts) if (!factByType.has(f.field_type)) factByType.set(f.field_type, f);
  const scoredMetrics = (Object.keys(person.metrics) as PerfMetric[]).filter((m) => person.metrics[m] != null);

  const crumbs: { label: string; href?: string }[] = [{ label: tr('levels.national'), href: '/' }];
  if (person.stateCode && person.state) crumbs.push({ label: person.state, href: `/state/${person.stateCode}` });
  if (person.constituencyId && person.constituency) crumbs.push({ label: person.constituency, href: `/area/${person.constituencyId}` });
  crumbs.push({ label: person.name });

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <Breadcrumbs items={crumbs} />

      {/* HERO */}
      <div className="mt-4 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-7">
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
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{person.name}</h1>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {person.party && <PartyChip party={person.party} />}
              {person.constituency && (
                <span className="flex items-center gap-1 text-sm text-ink-faint">
                  <Icon name="pin" size={15} /> {person.constituency}{person.state ? `, ${person.state}` : ''}
                </span>
              )}
            </div>
            <p className="mt-3 text-ink-soft">{person.current_position || tr(`accountability.roles.${roleKey}.oneLine`)}</p>
            {updated && <div className="mt-3 flex justify-center sm:justify-start"><LastUpdated date={updated} /></div>}
          </div>
        </div>
      </div>

      {/* SCORECARDS */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="rounded-3xl border border-perf/20 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-perf-soft text-perf"><Icon name="shield" size={18} /></span>
              {tr('profile.scorePerformance')}
            </h2>
            <Chip tone="perf">{tr('common.verifiedData')}</Chip>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <ScoreRing value={person.performance?.composite_percentile ?? null} size={116} label={tr('ranking.topLabel')} />
            <div className="min-w-0">
              {person.performance?.composite_percentile != null ? (
                <p className="font-bold text-perf-ink">{tr('ranking.cohortNote', { n: person.performance.composite_percentile, cohort: person.performance.cohort_label })}</p>
              ) : (
                <p className="text-sm text-ink-faint">{person.is_minister ? tr('profile.ministerExempt') : tr('profile.performanceInsufficient')}</p>
              )}
              <p className="mt-1 text-sm text-ink-faint">{tr('profile.perfHelp')}</p>
              <Link href="/methodology" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand">{tr('common.howCalculated')} <Icon name="arrow" size={14} /></Link>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-rating/25 bg-white p-5 shadow-soft" id="rate">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-rating-soft text-rating-ink"><Icon name="star" size={18} /></span>
              {tr('profile.scoreRating')}
            </h2>
            <Chip tone="rating">{tr('common.notVerified')}</Chip>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-4xl font-extrabold text-rating-ink">{sentiment.bayesian_mean != null ? sentiment.bayesian_mean.toFixed(1) : '—'}</span>
            <div>
              <Stars value={sentiment.bayesian_mean} size={20} />
              <p className="mt-0.5 text-xs text-ink-faint">{sentiment.n_votes === 0 ? tr('vote.confidenceNone') : tr('ranking.votes', { n: sentiment.n_votes })}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <VoteWidget politicianId={person.id} initial={{ mean: sentiment.bayesian_mean, votes: sentiment.n_votes, distribution: sentiment.distribution, confidence: sentiment.confidence }} />
          </div>
        </div>
      </div>

      {/* About: plain-language summary + party-change note + identity citation */}
      {(person.neutral_summary || person.party_note || person.identity_source) && (
        <section className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
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
                    <span className="text-sm text-ink-faint">{h.until ? `${h.from} – ${h.until}` : `${tr('profile.since')} ${h.from}`}</span>
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

      {/* Government role (all portfolios) */}
      {person.portfolios.length > 0 && (
        <section className="mt-5 rounded-3xl border border-brand/20 bg-brand-soft/40 p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink"><Icon name="parliament" size={20} className="text-brand" /> {tr('profile.govRoleTitle')}</h2>
          <p className="mt-1 text-sm text-ink-soft">{tr('profile.govRoleDesc', { rank: person.ministerRankLabel || tr('profile.minister') })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {person.portfolios.map((pf) => (
              <span key={pf} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-ink shadow-sm">
                <Icon name="check" size={14} className="text-brand" /> {pf}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Responsibilities */}
      <section className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
        <h2 className="text-xl font-bold text-ink">{tr('profile.responsibilitiesTitle')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <RoleCol icon="shield" tint="bg-perf-soft text-perf" label={tr('accountability.accountableLabel')} items={tArr(dict, `accountability.roles.${roleKey}.accountableFor`)} mark="check" />
          <RoleCol icon="parliament" tint="bg-brand-soft text-brand" label={tr('accountability.handlesLabel')} items={tArr(dict, `accountability.roles.${roleKey}.handles`)} mark="check" />
          <RoleCol icon="back" tint="bg-paper-sink text-ink-soft" label={tr('accountability.notResponsibleLabel')} items={tArr(dict, `accountability.roles.${roleKey}.notResponsible`)} mark="arrow" />
        </div>
        <Link href="/accountability" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">{tr('nav.accountability')} <Icon name="arrow" size={15} /></Link>
      </section>

      {/* Record */}
      <section className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
        <h2 className="text-xl font-bold text-ink">{tr('profile.recordTitle')}</h2>
        {!person.hasRecord ? (
          <p className="mt-2 text-sm text-ink-faint">{tr('profile.recordComingSoon')}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-faint">{tr('profile.recordSubtitle')}</p>
            {scoredMetrics.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('profile.groups.parliamentary')}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {scoredMetrics.map((m) => (
                    <StatTile key={m} icon={METRIC_ICON[m]} value={`${person.metrics[m]}${PERF_METRIC_META[m].unit}`} label={tr(`fields.${m}`)} hint={person.performance?.metric_percentiles[m] != null ? `${tr('ranking.topLabel')} ${person.performance.metric_percentiles[m]}%` : undefined} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('profile.groups.affidavit')}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(['assets_total', 'liabilities_total', 'criminal_cases_declared'] as const).map((field) => {
                  const f = factByType.get(field);
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

      {/* Areas + right to reply */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {person.districts.length > 0 && (
          <section className="rounded-3xl border border-line bg-white p-5 shadow-soft">
            <h2 className="flex items-center gap-2 font-bold text-ink"><Icon name="pin" size={18} className="text-brand" /> {tr('profile.jurisdictionTitle')}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {person.districts.map((d) => (
                <Link key={d} href={`/district/${person.stateCode}/${encodeURIComponent(d)}`} className="rounded-full bg-paper-sink px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-brand-soft hover:text-brand">{d}</Link>
              ))}
            </div>
          </section>
        )}
        <section className="rounded-3xl border border-line bg-brand-soft/50 p-5 shadow-soft">
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

      <div className="mt-4 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-7">
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
      <section className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
        <h2 className="text-xl font-bold text-ink">{tr('profile.officialRole')}</h2>
        <p className="mt-2 text-ink-soft">{tr(`offices.${ot}.handles`)}</p>
        <div className="mt-3 rounded-xl bg-paper-soft p-3 text-sm">
          <span className="font-semibold text-ink-faint">{tr('finder.escalateLabel')}: </span>
          <span className="text-ink-soft">{tr(`offices.${ot}.escalate`)}</span>
        </div>
      </section>

      {/* Office contact */}
      {(p.office_email || p.office_phone) && (
        <section className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
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

function RoleCol({ icon, tint, label, items, mark }: { icon: IconName; tint: string; label: string; items: string[]; mark: IconName }) {
  return (
    <div className="rounded-2xl bg-paper-soft p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <span className={`inline-grid h-7 w-7 place-items-center rounded-lg ${tint}`}><Icon name={icon} size={16} /></span>
        {label}
      </p>
      <ul className="mt-2.5 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-sm text-ink-soft"><Icon name={mark} size={15} className="mt-0.5 shrink-0 text-ink-faint" /><span>{it}</span></li>
        ))}
      </ul>
    </div>
  );
}
