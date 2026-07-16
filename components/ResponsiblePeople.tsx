'use client';
// The "actual people" ladder: for a problem + district, the real humans to
// contact in ESCALATION ORDER, local-first:
//   1. Level 1 - the office in your area (GP secretary / SHO / JE / ward office)
//   2. Level 2 - the block/tehsil/sub-division officer above it
//   3. Your MLA - the elected leader for YOUR assembly constituency (pickable)
//   4. District administration - DM (SP first for police matters)
//   5. State minister for the department → Chief Minister (the LAST resort,
//      not the first stop)
// plus the district's MPs as the parallel national lever. Shared by the /who
// Finder and the district page section.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { PROBLEM_ROUTES } from '@/lib/offices';
import { ESCALATION_CHAINS, PROBLEM_CHAIN } from '@/lib/escalation';
import { ministersForProblem, isPoliceProblem, type WhoPerson, type WhoDistrict } from '@/lib/responsibility';
import { primaryPhone, hasContactFallback, formatPhone } from '@/lib/contacts';
import type { ContactChannel, ProblemType, OfficeType } from '@/lib/types';
import { Avatar } from './ui';
import ContactFallback from './ContactFallback';
import PhoneLink from './PhoneLink';
import Icon, { type IconName } from './Icon';

export interface ResponsiblePeopleProps {
  problem: ProblemType;
  area: 'urban' | 'rural';
  stateCode: string;
  state: string;
  asOf?: string;
  cm?: WhoPerson;
  ministers: WhoPerson[];
  district: string;
  people: WhoDistrict;
  /** Published helplines/portals for this state + nationally (see lib/contacts). */
  channels?: ContactChannel[];
  /** Compact = embedded on the district page (fewer explainer lines). */
  compact?: boolean;
}

function PersonRow({ p, role, holds }: { p: WhoPerson; role: string; holds?: string[] }) {
  return (
    <Link
      href={`/person/${p.id}`}
      className="pressable flex items-center gap-3 rounded-2xl border border-line/70 bg-white/90 p-3 hover:border-brand/40 hover:shadow-soft"
    >
      <Avatar name={p.name} src={p.photo} size={46} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-bold text-ink">{p.name}</span>
          {p.party && <span className="rounded-full bg-paper-sink px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{p.party}</span>}
        </span>
        <span className="block truncate text-xs text-ink-faint">
          {role}
          {holds && holds.length > 0 ? ` · ${holds.slice(0, 2).join(', ')}` : ''}
        </span>
      </span>
      <Icon name="chevron" size={16} className="-rotate-90 shrink-0 text-ink-faint" />
    </Link>
  );
}

function Step({
  n,
  icon,
  title,
  children,
  last = false,
}: {
  n: number;
  icon: IconName;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="relative pl-12">
      {!last && <span className="absolute left-[15px] top-9 h-[calc(100%-1.25rem)] w-0.5 rounded bg-gradient-to-b from-brand/40 to-brand/10" aria-hidden />}
      <span className="absolute left-0 top-0.5 grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-extrabold text-white shadow-soft">
        {n}
      </span>
      <p className="flex items-center gap-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        <Icon name={icon} size={13} /> {title}
      </p>
      <div className="mt-1.5 pb-5">{children}</div>
    </li>
  );
}

/** A role-level office card (from the verified escalation chains). */
function OfficeCard({
  title,
  handles,
  escalate,
  call,
}: {
  title: string;
  handles: string;
  escalate?: string;
  /** The published number that reaches this office, when one exists. */
  call?: ContactChannel;
}) {
  return (
    <div className="rounded-2xl border border-line/70 bg-white/85 p-3.5">
      <p className="font-bold text-ink">{title}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{handles}</p>
      {call && (
        <PhoneLink
          value={call.value}
          sourceUrl={call.source_url}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-xs font-bold text-brand-ink hover:bg-brand hover:text-white"
        >
          <Icon name="phone" size={12} /> {formatPhone(call.value)} · {call.label}
        </PhoneLink>
      )}
      {escalate && <p className="mt-1.5 text-xs text-ink-faint">{escalate}</p>}
    </div>
  );
}

export default function ResponsiblePeople({
  problem,
  area,
  stateCode,
  state,
  asOf,
  cm,
  ministers,
  district,
  people,
  channels,
  compact = false,
}: ResponsiblePeopleProps) {
  const { t } = useI18n();

  // ---- "Your MLA": resolve the district's MLAs to the user's own assembly
  // constituency (remembered per district on this device). --------------------
  const acKey = `ryp:my-ac:${stateCode}:${district}`;
  const [acId, setAcId] = useState('');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(acKey) || '';
      setAcId(saved && people.mlas.some((m) => m.id === saved) ? saved : '');
    } catch {
      setAcId('');
    }
  }, [acKey, people.mlas]);
  const selectAc = (id: string) => {
    setAcId(id);
    try {
      if (id) localStorage.setItem(acKey, id);
      else localStorage.removeItem(acKey);
    } catch {
      /* ignore */
    }
  };
  const myMla = people.mlas.find((m) => m.id === acId) ?? (people.mlas.length === 1 ? people.mlas[0] : null);

  // ---- Level 1 / Level 2 from the VERIFIED escalation chain for this problem.
  // These are the sub-district rungs (GP/ward/station → block/tehsil) that used
  // to be hidden behind a collapsed panel while everything jumped to ministers.
  const chain = ESCALATION_CHAINS[PROBLEM_CHAIN[problem][area]];
  const districtIdx = chain.rungs.findIndex((r) => r.level === 'district');
  const level1 = chain.rungs[0];
  const level2 = chain.rungs.slice(1, districtIdx > 1 ? Math.min(districtIdx, 3) : 2);

  const police = isPoliceProblem(problem);
  const deptMinisters = ministersForProblem(ministers, cm?.id, problem, area);
  // CMs often keep key departments (Home, Urban Development…) for themselves.
  const cmHoldsDept = !!cm && ministersForProblem([cm], undefined, problem, area, 1).length > 0;
  const dm = people.officials.find((o) => o.officeType === 'collector_dm');
  const sp = people.officials.find((o) => o.officeType === 'sp_district');
  // Keep the route's own local office label as a hint under Level 1 when it
  // differs from the chain rung (e.g. "BDO" for rural roads).
  const routeLocal = PROBLEM_ROUTES[problem][area].filter(
    (o: OfficeType) => !['collector_dm', 'sp_district'].includes(o),
  );

  let n = 0;
  const districtHref = `/district/${stateCode}/${encodeURIComponent(district)}`;
  const shownMlas = people.mlas.slice(0, 6);
  // Whether the "no named officer" copy can point at something real.
  const hasFallback = hasContactFallback(people.portal, channels, problem, district);
  // The district step lists the SP (police problems only) and the DM; the contact
  // block is worth showing whenever either of them is unnamed.
  const anyOfficerMissing = police ? !dm?.name || !sp?.name : !dm?.name;

  return (
    <div>
      <ol className="mt-1">
        {/* 1 - LEVEL 1: the office in your area. Carries the one published number
             that reaches it, so the first stop is actionable, not just described. */}
        <Step n={++n} icon="home" title={t('who.stepLevel1')}>
          <OfficeCard
            title={level1.title}
            handles={level1.handles}
            escalate={level1.escalateWhen}
            call={primaryPhone(channels ?? [], problem, district)}
          />
        </Step>

        {/* 2 - LEVEL 2: block / tehsil / sub-division, before anything district-wide */}
        {level2.length > 0 && (
          <Step n={++n} icon="layers" title={t('who.stepLevel2')}>
            <div className="space-y-2">
              {level2.map((r) => (
                <OfficeCard key={r.id} title={r.title} handles={r.handles} escalate={r.escalateWhen} />
              ))}
            </div>
          </Step>
        )}

        {/* 3 - YOUR MLA: the elected leader for your own assembly seat */}
        {people.mlas.length > 0 && (
          <Step n={++n} icon="people" title={t('who.stepMla')}>
            {people.mlas.length > 1 && (
              <>
                <label htmlFor={`ac-${district}`} className="sr-only">{t('who.pickAc')}</label>
                <select
                  id={`ac-${district}`}
                  value={acId}
                  onChange={(e) => selectAc(e.target.value)}
                  className="mb-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="">{t('who.pickAc')}</option>
                  {people.mlas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.sub || m.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {myMla ? (
              <PersonRow p={myMla} role={`${t('district.chipMla')} · ${myMla.sub || ''}`} />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {shownMlas.map((p) => (
                  <PersonRow key={p.id} p={p} role={`${t('district.chipMla')} · ${p.sub || ''}`} />
                ))}
              </div>
            )}
            {!myMla && people.mlas.length > shownMlas.length && (
              <Link href={districtHref} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                {t('who.moreMlas', { n: people.mlas.length - shownMlas.length })} <Icon name="arrow" size={12} />
              </Link>
            )}
            {!compact && <p className="mt-2 text-xs text-ink-faint">{t('who.mlaEscalateHint')}</p>}
          </Step>
        )}

        {/* 4 - district administration: SP for police issues, DM for the rest */}
        <Step n={++n} icon="shield" title={t('who.stepDistrict')}>
          <div className="space-y-2">
            {(police ? (['sp_district', 'collector_dm'] as const) : (['collector_dm'] as const)).map((ot) => {
              const officer = ot === 'collector_dm' ? dm : sp;
              return (
                <div key={ot} className="rounded-2xl border border-line/70 bg-white/85 p-3.5">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                    {t(`offices.${ot}.label`)}
                    <span className="text-xs font-semibold text-ink-faint">· {district}</span>
                  </p>
                  {officer?.name ? (
                    <div className="mt-1.5">
                      <p className="font-semibold text-ink">
                        {officer.name}
                        {officer.service && <span className="text-sm font-normal text-ink-faint"> · {officer.service}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {officer.email && (
                          <a href={`mailto:${officer.email}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                            <Icon name="mail" size={12} /> {officer.email}
                          </a>
                        )}
                        {officer.phone && (
                          <span className="inline-flex items-center gap-1 text-ink-faint"><Icon name="phone" size={12} /> {officer.phone}</span>
                        )}
                        {officer.asOf && <span className="text-ink-faint">{t('officials.verifiedAsOf')} {officer.asOf}</span>}
                      </p>
                    </div>
                  ) : (
                    // We don't name most DMs/SPs - officers transfer too often to
                    // track nationally. The actual ways in are rendered ONCE below
                    // for the whole step rather than repeated under each officer.
                    <p className="mt-1 text-sm text-ink-faint">
                      {t(hasFallback ? 'officials.currentlyUnknown' : 'officials.currentlyUnknownBare')}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-ink-soft">{t(`offices.${ot}.escalate`)}</p>
                </div>
              );
            })}
          </div>
          {/* One contact block for the district, shown when we could not name an
              officer above. Per-card copies would repeat the same district site
              and helplines two or three times over. */}
          {anyOfficerMissing && (
            <ContactFallback portal={people.portal} channels={channels} problem={problem} district={district} />
          )}
        </Step>

        {/* 5 - the state minister who runs this department, then the CM.
             The political executive is the LAST resort, not the first stop.
             When the CM keeps the department (common for Home), the CM IS this
             step, so the separate CM step below is skipped. */}
        {(() => {
          const cmIsDeptOwner = deptMinisters.length === 0 && cmHoldsDept && !!cm;
          return (
            <>
              <Step n={++n} icon="flag" title={t('who.stepMinister')} last={cmIsDeptOwner}>
                {deptMinisters.length > 0 ? (
                  <div className="space-y-2">
                    {deptMinisters.map((m) => (
                      <PersonRow key={m.id} p={m} role={m.sub || t('profile.minister')} holds={m.portfolios} />
                    ))}
                  </div>
                ) : cmIsDeptOwner ? (
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-brand-soft px-3 py-2 text-xs font-semibold text-brand-ink">
                      <Icon name="sparkle" size={14} /> {t('who.cmHoldsDept')}
                    </p>
                    <PersonRow p={cm!} role={`${t('stateGov.cm')}, ${state}`} holds={cm!.portfolios} />
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-line bg-white/80 p-3.5 text-sm text-ink-faint">
                    {t('who.noMinisterMatch', { state })}
                  </p>
                )}
              </Step>

              {!cmIsDeptOwner && (
                <Step n={++n} icon="sparkle" title={t('who.stepCm')} last>
                  {cm ? (
                    <PersonRow p={cm} role={`${t('stateGov.cm')}, ${state}`} />
                  ) : (
                    <p className="rounded-2xl border border-dashed border-line bg-white/80 p-3.5 text-sm text-ink-faint">
                      {t('stateGov.beingVerified')}
                    </p>
                  )}
                </Step>
              )}
            </>
          );
        })()}
      </ol>

      {/* Parallel national lever - the district's MPs (MLAs now sit in the ladder) */}
      {people.mps.length > 0 && (
        <div className="mt-2 rounded-3xl border border-perf/25 bg-perf-soft/40 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-perf-ink">
            <Icon name="people" size={16} /> {t('who.parallelTitle')}
          </p>
          {!compact && <p className="mt-0.5 text-xs text-ink-soft">{t('who.parallelHelp', { district })}</p>}
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">{t('who.mpsLabel')}</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {people.mps.map((p) => (
              <PersonRow key={p.id} p={p} role={`${t('district.chipMp')} · ${p.sub || ''}`} />
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
        {asOf && <span>{t('who.govAsOf', { date: asOf })}</span>}
        <Link href={districtHref} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
          {t('who.openDistrict', { district })} <Icon name="arrow" size={12} />
        </Link>
      </p>
      {routeLocal.length > 0 && chain.variesNote && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          <Icon name="info" size={12} className="mr-1 inline" /> {t('who.titlesVary')}
        </p>
      )}
    </div>
  );
}
