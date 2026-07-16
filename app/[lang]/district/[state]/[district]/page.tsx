import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getRanking, getDistrictOfficials, officialPersonId, getDistrictView, getStateGovernment, getDistrictPortal, getContactChannels, getStates, getDistrictsInState } from '@/lib/data';
import { buildDistrictMap, matchDistrictName } from '@/lib/geo-districts';
import { getI18n } from '@/lib/i18n/server';
import { DEFAULT_LOCALE } from '@/lib/i18n/locales';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { OFFICE_META } from '@/lib/offices';
import { STATE_RANK_LABEL, type OfficeSeat, type Politician } from '@/lib/types';
import type { WhoPerson, WhoDistrict, WhoPortal } from '@/lib/responsibility';
import { formatPhone } from '@/lib/contacts';
import DistrictWhoFixes from '@/components/DistrictWhoFixes';
import PhoneLink from '@/components/PhoneLink';
import Breadcrumbs from '@/components/Breadcrumbs';
import RankingList from '@/components/RankingList';
import AdSlot from '@/components/AdSlot';
import GeoMap, { type GeoMapShape } from '@/components/GeoMap';
import { SectionCard, Avatar, PartyChip, Chip, PageHero, StatPill, Eyebrow } from '@/components/ui';
import { Reveal, CountUp } from '@/components/motion';
import Icon from '@/components/Icon';

// Daily self-heal only - content changes arrive via deploy or /api/revalidate,
// and every ISR regeneration is a billed write (see README "How data flows").
export const revalidate = 86400;

// Prebuild every district page for English (~600) so first hits are CDN
// cache hits; other locales render on demand and ISR-cache.
export async function generateStaticParams() {
  const states = await getStates();
  const out: { lang: string; state: string; district: string }[] = [];
  for (const s of states) {
    for (const district of await getDistrictsInState(s.stateCode)) {
      out.push({ lang: DEFAULT_LOCALE, state: s.stateCode, district });
    }
  }
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; state: string; district: string }>;
}): Promise<Metadata> {
  const { district } = await params;
  return { title: `${decodeURIComponent(district)} - MPs, MLAs & officials` };
}

function RepCard({ p, roleChip }: { p: Politician; roleChip: string }) {
  return (
    <Link
      href={`/person/${p.id}`}
      className="pressable flex items-center gap-3 rounded-2xl border border-line/70 bg-white/85 p-3.5 hover:border-brand/40 hover:shadow-soft"
    >
      <Avatar name={p.name} src={p.photo_url} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold text-ink">{p.name}</span>
          <PartyChip party={p.party} />
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-faint">
          <Icon name="pin" size={13} /> {p.constituencyName}
        </p>
      </div>
      <Chip tone="brand">{roleChip}</Chip>
      <Icon name="chevron" size={16} className="-rotate-90 shrink-0 text-ink-faint" />
    </Link>
  );
}

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ lang: string; state: string; district: string }>;
}) {
  const { lang, state, district } = await params;
  const districtParam = decodeURIComponent(district);
  const view = await getDistrictView(state, districtParam);
  if (!view) notFound();

  const [ranking, officials, stateGov, portal, channels] = await Promise.all([
    getRanking('district', `${state}/${view.district}`),
    getDistrictOfficials(state, view.district),
    getStateGovernment(state),
    // The fallbacks the ladder needs wherever no officer is named.
    getDistrictPortal(state, view.district),
    getContactChannels(state),
  ]);
  const { dict, locale } = await getI18n(lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  // Props for the "who fixes what here" real-people ladder (client component).
  const partyShort = (party?: string) => (party ? party.match(/\(([^)]+)\)\s*$/)?.[1] ?? party : undefined);
  const toWho = (p: Politician): WhoPerson => ({
    id: p.id,
    name: p.name,
    party: partyShort(p.party),
    photo: p.photo_url,
    sub: p.constituencyName,
  });
  const cmM = stateGov?.ministers.find((m) => m.rank === 'CM');
  const ministerWho = (m: NonNullable<typeof cmM>): WhoPerson => ({
    id: m.politicianId || m.id,
    name: m.name,
    party: partyShort(m.party),
    photo: m.photo_url,
    sub: STATE_RANK_LABEL[m.rank],
    portfolios: m.portfolios,
  });
  const whoPeople: WhoDistrict = {
    officials: officials
      .filter((s) => s.incumbent && (s.officeType === 'collector_dm' || s.officeType === 'sp_district'))
      .map((s) => ({
        officeType: s.officeType as 'collector_dm' | 'sp_district',
        name: s.incumbent!.name,
        service: s.incumbent!.service,
        email: s.incumbent!.office_email,
        phone: s.incumbent!.office_phone,
        asOf: s.incumbent!.as_of,
        sourceName: s.incumbent!.source_name,
        sourceUrl: s.incumbent!.source_url,
      })),
    mlas: view.mlas.map(toWho),
    mps: view.mps.map(toWho),
    portal: portal
      ? {
          url: portal.url,
          whosWhoUrl: portal.whosWhoUrl,
          contactUrl: portal.contactUrl,
          phone: portal.phone,
          email: portal.email,
          retrieved: portal.retrieved_date,
        }
      : undefined,
  };
  const govAsOf = stateGov?.asOf ? stateGov.asOf.replace(/^\s*as of\s*/i, '').split(/[;(]/)[0].trim() : undefined;

  // "You are here" map: all districts of the state, this one highlighted.
  const districtMap = buildDistrictMap(state, 520);
  const canonical = matchDistrictName(state, view.district);
  const mapShapes: GeoMapShape[] | null = districtMap
    ? districtMap.shapes.map((s) => ({
        ...s,
        href: `/district/${state}/${encodeURIComponent(s.name)}`,
        sub: s.name === canonical ? tr('district.youAreHere') : view.state,
        highlighted: s.name === canonical,
        value: s.name === canonical ? 1 : 0.15,
      }))
    : null;

  return (
    <>
      <PageHero
        crumbs={
          <Breadcrumbs
            items={[
              { label: tr('levels.national'), href: '/' },
              { label: view.state, href: `/state/${state}` },
              { label: view.district },
            ]}
          />
        }
        chips={<Chip tone="neutral" icon="map">{tr('levels.district')} · {view.state}</Chip>}
        title={view.district}
        subtitle={tr('district.subtitle', { district: view.district })}
        aside={
          <div className="flex flex-wrap gap-2.5">
            <StatPill value={<CountUp value={view.mps.length} />} label={tr('district.statMps')} tone="brand" />
            <StatPill value={<CountUp value={view.mlas.length} />} label={tr('district.statMlas')} tone="perf" />
            <StatPill value={<CountUp value={view.constituencies.length} />} label={tr('home.statAreas')} tone="ink" />
          </div>
        }
      />

      <div className="mx-auto max-w-content px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            {/* Who fixes what HERE - problem → the actual responsible people */}
            <Reveal>
              <SectionCard title={tr('district.whoTitle', { district: view.district })} subtitle={tr('district.whoHelp')} icon="megaphone">
                <DistrictWhoFixes
                  stateCode={state}
                  state={view.state}
                  asOf={govAsOf}
                  cm={cmM ? ministerWho(cmM) : undefined}
                  ministers={(stateGov?.ministers ?? []).map(ministerWho)}
                  district={view.district}
                  people={whoPeople}
                  channels={channels}
                />
              </SectionCard>
            </Reveal>

            {/* Elected representatives - the accountability layer citizens vote for */}
            <Reveal>
              <SectionCard title={tr('district.repsTitle')} subtitle={tr('district.repsHelp')} icon="people">
                {view.mps.length > 0 && (
                  <div>
                    <Eyebrow icon="parliament">{tr('district.yourMps')}</Eyebrow>
                    <div className="mt-2 space-y-2.5">
                      {view.mps.map((p) => (
                        <RepCard key={p.id} p={p} roleChip={tr('district.chipMp')} />
                      ))}
                    </div>
                  </div>
                )}
                {view.mlas.length > 0 && (
                  <div className={view.mps.length > 0 ? 'mt-5' : ''}>
                    <Eyebrow icon="flag">{tr('district.yourMlas')}</Eyebrow>
                    <div className="mt-2 space-y-2.5">
                      {view.mlas.map((p) => (
                        <RepCard key={p.id} p={p} roleChip={tr('district.chipMla')} />
                      ))}
                    </div>
                  </div>
                )}
                {view.mps.length === 0 && view.mlas.length === 0 && (
                  <p className="text-sm text-ink-faint">{tr('district.noReps')}</p>
                )}
              </SectionCard>
            </Reveal>

            {/* Appointed officials */}
            <Reveal>
              <SectionCard title={tr('officials.title')} subtitle={tr('officials.subtitle')} icon="shield">
                <div className="space-y-3">
                  {officials.map((seat) => (
                    <OfficeSeatCard key={seat.id} seat={seat} tr={tr} locale={locale} portal={whoPeople.portal} district={view.district} />
                  ))}
                </div>
                <Link href="/who" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
                  <Icon name="megaphone" size={15} /> {tr('officials.findCta')}
                </Link>
              </SectionCard>
            </Reveal>

            {ranking && ranking.entries.length > 0 && (
              <Reveal>
                <SectionCard title={tr('home.topTitle')} subtitle={tr('home.topHelp')} icon="star">
                  <RankingList entries={ranking.entries} />
                </SectionCard>
              </Reveal>
            )}
          </div>

          <div className="space-y-6">
            {mapShapes && (
              <Reveal>
                <SectionCard title={tr('district.mapTitle')} subtitle={tr('district.mapHelp', { state: view.state })} icon="map">
                  <GeoMap
                    shapes={mapShapes}
                    w={districtMap!.w}
                    h={districtMap!.h}
                    ariaLabel={tr('district.mapAria', { district: view.district, state: view.state })}
                    maxWidthClass="max-w-sm"
                  />
                </SectionCard>
              </Reveal>
            )}

            {view.constituencies.length > 0 && (
              <Reveal>
                <SectionCard title={tr('district.areasTitle')} icon="pin" subtitle={tr('district.areasHelp')}>
                  <ul className="flex flex-wrap gap-2">
                    {view.constituencies.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/area/${c.id}`}
                          className="pressable inline-flex items-center gap-1 rounded-full border border-line bg-white/85 px-3 py-1 text-sm text-ink-soft hover:border-brand hover:text-brand"
                        >
                          {c.name}
                          <span className="text-xs text-ink-faint">{c.type === 'PC' ? tr('search.pcShort') : tr('search.acShort')}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              </Reveal>
            )}

            <Reveal>
              <SectionCard title={tr('accountability.title')} icon="info">
                <p className="text-sm text-ink-faint">{tr('accountability.intro')}</p>
                <Link href="/accountability" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                  {tr('common.readMore')} <Icon name="arrow" size={14} />
                </Link>
              </SectionCard>
            </Reveal>
            <AdSlot />
          </div>
        </div>
      </div>
    </>
  );
}

function OfficeSeatCard({
  seat,
  tr,
  locale,
  portal,
  district,
}: {
  seat: OfficeSeat;
  tr: (k: string, v?: Record<string, string | number>) => string;
  locale: string;
  /** The district's own site - shown when we have no named incumbent. */
  portal?: WhoPortal;
  district?: string;
}) {
  const inc = seat.incumbent;
  return (
    <div className="rounded-2xl border border-line/70 bg-white/85 p-4">
      <p className="flex items-center gap-1.5 font-bold text-ink">
        <span className="inline-grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon name={OFFICE_META[seat.officeType].icon} size={15} />
        </span>
        {tr(`offices.${seat.officeType}.label`)}
      </p>
      <p className="mt-1.5 text-sm text-ink-soft">{tr(`offices.${seat.officeType}.handles`)}</p>

      {inc ? (
        <div className="mt-3 rounded-xl bg-paper-soft p-3">
          <p className="font-semibold text-ink">
            <Link href={`/person/${officialPersonId(inc.name)}`} className="hover:text-brand hover:underline">{inc.name}</Link>
            {inc.service ? <span className="text-sm font-normal text-ink-faint"> · {inc.service}</span> : null}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {inc.office_email && (
              <a href={`mailto:${inc.office_email}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                <Icon name="mail" size={12} /> {inc.office_email}
              </a>
            )}
            {inc.office_phone && (
              <span className="inline-flex items-center gap-1 text-ink-faint"><Icon name="phone" size={12} /> {inc.office_phone}</span>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
            <a href={inc.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline">
              {inc.source_name}
            </a>
            {inc.as_of && <span>· {tr('officials.verifiedAsOf')} {formatDate(inc.as_of, locale)}</span>}
            <Link href="/grievance" className="hover:underline">· {tr('officials.reportIncorrect')}</Link>
          </p>
        </div>
      ) : (
        // No named officer (true for most districts - postings change constantly).
        // Point at the district's own Who's Who instead of dead-ending: it names
        // whoever holds the post today, and stays right when they move on.
        <div className="mt-2">
          <p className="text-xs text-ink-faint">{tr(portal ? 'officials.currentlyUnknown' : 'officials.currentlyUnknownBare')}</p>
          {portal && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={portal.whosWhoUrl || portal.contactUrl || portal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-xs font-bold text-brand-ink hover:bg-brand hover:text-white"
              >
                <Icon name="law" size={12} /> {tr(portal.whosWhoUrl ? 'contacts.whosWho' : 'contacts.districtSite')}
              </a>
              {portal.phone && (
                <PhoneLink
                  value={portal.phone}
                  sourceUrl={portal.contactUrl || portal.url}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand/40"
                >
                  <Icon name="phone" size={12} /> {formatPhone(portal.phone)}
                </PhoneLink>
              )}
              {portal.email && (
                <a
                  href={`mailto:${portal.email}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand/40"
                >
                  <Icon name="mail" size={12} /> {portal.email}
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs">
        <span className="font-semibold text-ink-faint">{tr('finder.escalateLabel')}: </span>
        <span className="text-ink-soft">{tr(`offices.${seat.officeType}.escalate`)}</span>
      </p>
    </div>
  );
}
