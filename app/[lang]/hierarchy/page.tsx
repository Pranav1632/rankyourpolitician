import Link from 'next/link';
import type { Metadata } from 'next';
import { getI18n, type LangParams } from '@/lib/i18n/server';
import { t, tArr } from '@/lib/i18n';
import { getCentralGovernment, getConstitutionalOffices, getNationalStats, getStateGovernments, getIndex } from '@/lib/data';
import type { ConstitutionalOffice } from '@/lib/types';
import Breadcrumbs from '@/components/Breadcrumbs';
import StateCMPicker, { type CmSummary } from '@/components/StateCMPicker';
import { Avatar, Chip, PageHero, Eyebrow } from '@/components/ui';
import { Reveal, CountUp } from '@/components/motion';
import AdSlot from '@/components/AdSlot';
import Icon, { type IconName } from '@/components/Icon';

// Daily self-heal only - content changes arrive via deploy or /api/revalidate,
// and every ISR regeneration is a billed write (see README "How data flows").
export const revalidate = 86400;
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';
export const metadata: Metadata = {
  title: 'Org chart of India - who answers to whom',
  description:
    'How India is governed, drawn as one simple chart: from you the voter, to Parliament and the PM, your state government, your district officials and your local body.',
};

function Node({
  icon,
  eyebrow,
  title,
  desc,
  chips,
  href,
  children,
  tone = 'brand',
}: {
  icon: IconName;
  eyebrow: string;
  title: React.ReactNode;
  desc?: string;
  chips?: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
  tone?: 'brand' | 'perf' | 'rating' | 'ink';
}) {
  const tint = {
    brand: 'bg-brand-soft text-brand',
    perf: 'bg-perf-soft text-perf',
    rating: 'bg-rating-soft text-rating-ink',
    ink: 'bg-paper-sink text-ink-soft',
  }[tone];
  const inner = (
    <div className={`glass rounded-3xl p-5 ${href ? 'pressable transition hover:shadow-lift' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tint}`}>
          <Icon name={icon} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h3 className="mt-0.5 text-lg font-bold text-ink">{title}</h3>
          {desc && <p className="mt-1 text-sm text-ink-soft">{desc}</p>}
          {chips && <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>}
        </div>
        {href && <Icon name="arrow" size={18} className="mt-1 shrink-0 text-brand" />}
      </div>
      {children}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

/** Vertical connector between levels. */
function Drop({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden="true">
      <span className="h-7 w-0.5 rounded bg-gradient-to-b from-brand/50 to-brand/15" />
      {label && (
        <span className="glass-strong -mt-1 rounded-full px-3 py-0.5 text-[11px] font-semibold text-ink-soft">{label}</span>
      )}
      <span className="h-7 w-0.5 rounded bg-gradient-to-b from-brand/15 to-brand/50" />
      <Icon name="chevron" size={16} className="-mt-1.5 text-brand/60" />
    </div>
  );
}

export default async function HierarchyPage({ params }: { params: Promise<LangParams> }) {
  const { dict } = await getI18n((await params).lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  const [central, stats, stateGovs, idx, constitutional] = await Promise.all([
    getCentralGovernment(),
    getNationalStats(),
    getStateGovernments(),
    getIndex(),
    getConstitutionalOffices(),
  ]);
  const pm = central.find((m) => m.rank === 'PM');
  const co = (k: ConstitutionalOffice['office']) => constitutional.find((o) => o.office === k);
  const president = co('president');
  const vicePresident = co('vice_president');
  const parliamentOfficers = [co('ls_speaker'), co('lop_ls'), co('lop_rs')].filter(Boolean) as ConstitutionalOffice[];

  const mlasByState = new Map<string, number>();
  for (const p of idx.politicians) {
    if (p.house === 'Vidhan Sabha') mlasByState.set(p.stateCode, (mlasByState.get(p.stateCode) ?? 0) + 1);
  }
  const cmStates: CmSummary[] = idx.states
    .map((s) => {
      const gov = stateGovs.find((g) => g.stateCode === s.stateCode);
      const cm = gov?.ministers.find((m) => m.rank === 'CM');
      return {
        stateCode: s.stateCode,
        state: s.state,
        cmName: cm?.name,
        cmParty: cm?.party,
        cmId: cm ? cm.politicianId || cm.id : undefined,
        cmPhoto: cm?.photo_url,
        governor: gov?.governor?.name,
        mlas: mlasByState.get(s.stateCode) ?? 0,
        presidentsRule: gov?.governmentStatus === 'presidents_rule',
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state));

  return (
    <>
      <PageHero
        crumbs={<Breadcrumbs items={[{ label: tr('levels.national'), href: '/' }, { label: tr('nav.hierarchy') }]} />}
        title={tr('hierarchyPage.title')}
        subtitle={tr('hierarchyPage.subtitle')}
      />

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* 1 - The citizen, at the top of the chart */}
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-deep p-6 text-white shadow-glow">
            <div className="flex items-start gap-3">
              <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
                <Icon name="people" size={24} />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{tr('hierarchyPage.youEyebrow')}</p>
                <h2 className="mt-0.5 text-xl font-extrabold">{tr('hierarchyPage.youTitle')}</h2>
                <p className="mt-1 text-sm text-white/85">{tr('hierarchyPage.youDesc')}</p>
              </div>
            </div>
          </div>
        </Reveal>

        <Drop label={tr('hierarchyPage.youElect')} />

        {/* 2 - Union level */}
        <Reveal>
          <Node
            icon="parliament"
            eyebrow={tr('hierarchyPage.unionEyebrow')}
            title={tr('hierarchyPage.parliamentTitle')}
            desc={tr('hierarchyPage.parliamentDesc')}
            href="/india"
            chips={
              <>
                <Chip tone="brand">
                  <CountUp value={stats.lokSabha} /> {tr('hierarchyPage.chipLokSabha')}
                </Chip>
                <Chip tone="neutral">
                  <CountUp value={stats.rajyaSabha} /> {tr('hierarchyPage.chipRajyaSabha')}
                </Chip>
              </>
            }
          >
            {/* Presiding officer + the statutory Opposition - the House's own
                counterweights to the government (info-only, never rated). */}
            {parliamentOfficers.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {parliamentOfficers.map((o) => (
                  <div key={o.id} className="flex items-center gap-2.5 rounded-2xl bg-white/90 p-2.5">
                    <Avatar name={o.name} src={o.photo_url} size={38} />
                    {/* Plain text (no inner <a>): the whole Node is already a link */}
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-ink-faint">{o.title}</p>
                      <p className="truncate text-sm font-bold text-ink">{o.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Node>
        </Reveal>

        <Drop label={tr('hierarchyPage.electsPresident')} />

        {/* 2b - Head of State */}
        {president && (
          <>
            <Reveal>
              <Node
                icon="law"
                eyebrow={tr('hierarchyPage.presidentEyebrow')}
                title={president.title}
                desc={president.note}
                href="/india"
                chips={<Chip tone="neutral">{tr('hierarchyPage.chipNonPartisan')}</Chip>}
              >
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-2xl bg-white/90 p-3">
                    <Avatar name={president.name} src={president.photo_url} size={48} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{president.title}</p>
                      <p className="truncate font-bold text-ink">{president.name}</p>
                    </div>
                  </div>
                  {vicePresident && (
                    <div className="flex items-center gap-3 rounded-2xl bg-white/90 p-3">
                      <Avatar name={vicePresident.name} src={vicePresident.photo_url} size={48} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{vicePresident.title}</p>
                        <p className="truncate font-bold text-ink">{vicePresident.name}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Node>
            </Reveal>
            <Drop label={tr('hierarchyPage.presidentAppoints')} />
          </>
        )}
        {!president && <Drop label={tr('hierarchyPage.parliamentChooses')} />}

        <Reveal>
          <Node
            icon="sparkle"
            eyebrow={tr('hierarchyPage.unionEyebrow')}
            title={tr('hierarchyPage.pmTitle')}
            desc={tr('hierarchyPage.pmDesc')}
            href="/india"
            chips={<Chip tone="warn">{central.length} {tr('hierarchyPage.chipMinisters')}</Chip>}
          >
            {pm && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/90 p-3">
                <Avatar name={pm.name} src={pm.photo_url} size={48} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{tr('central.pm')}</p>
                  <p className="truncate font-bold text-ink">{pm.name}</p>
                </div>
              </div>
            )}
          </Node>
        </Reveal>

        <Drop label={tr('hierarchyPage.statesMirror')} />

        {/* 3 - State level */}
        <Reveal>
          <Node
            icon="flag"
            eyebrow={tr('hierarchyPage.stateEyebrow')}
            title={tr('hierarchyPage.stateTitle')}
            desc={tr('hierarchyPage.stateDesc')}
            tone="perf"
            chips={
              <>
                <Chip tone="perf">
                  <CountUp value={stats.mlas} /> {tr('hierarchyPage.chipMlas')}
                </Chip>
                <Chip tone="neutral">
                  <CountUp value={stats.mlcs} /> {tr('hierarchyPage.chipMlcs')}
                </Chip>
                <Chip tone="neutral">{stats.states} {tr('home.statStates')}</Chip>
              </>
            }
          >
            <div className="mt-4">
              <StateCMPicker states={cmStates} />
            </div>
          </Node>
        </Reveal>

        <Drop label={tr('hierarchyPage.stateRuns')} />

        {/* 4 - District level */}
        <Reveal>
          <Node
            icon="shield"
            eyebrow={tr('hierarchyPage.districtEyebrow')}
            title={tr('hierarchyPage.districtTitle')}
            desc={tr('hierarchyPage.districtDesc')}
            tone="rating"
            href="/who"
            chips={
              <>
                <Chip tone="rating">
                  <CountUp value={stats.districts} /> {tr('home.statDistricts')}
                </Chip>
                <Chip tone="neutral">{tr('hierarchyPage.chipAppointed')}</Chip>
              </>
            }
          />
        </Reveal>

        <Drop label={tr('hierarchyPage.districtDelegates')} />

        {/* 5 - Local level */}
        <Reveal>
          <Node
            icon="home"
            eyebrow={tr('hierarchyPage.localEyebrow')}
            title={tr('hierarchyPage.localTitle')}
            desc={tr('hierarchyPage.localDesc')}
            tone="ink"
            href="/accountability"
            chips={<Chip tone="neutral">{tr('hierarchyPage.chipComingSoon')}</Chip>}
          />
        </Reveal>

        {/* Side note - the independent judiciary */}
        <Reveal className="mt-6">
          <div className="rounded-3xl border border-dashed border-line bg-white/80 p-5">
            <div className="flex items-start gap-3">
              <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-paper-sink text-ink-soft">
                <Icon name="scales" size={22} />
              </span>
              <div>
                <h3 className="font-bold text-ink">{tr('hierarchyPage.judiciaryTitle')}</h3>
                <p className="mt-1 text-sm text-ink-soft">{tr('hierarchyPage.judiciaryDesc')}</p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* How to use this */}
        <Reveal className="mt-6">
          <div className="glass rounded-3xl p-5">
            <h3 className="flex items-center gap-2 font-bold text-ink">
              <Icon name="megaphone" size={18} className="text-accent" /> {tr('hierarchyPage.howToTitle')}
            </h3>
            <ul className="mt-3 space-y-2">
              {tArr(dict, 'hierarchyPage.howToItems').map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink-soft">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-perf" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/who" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-accent-ink">
              {tr('finder.title')} <Icon name="arrow" size={15} />
            </Link>
          </div>
        </Reveal>

        <div className="mt-8">
          <AdSlot />
        </div>
      </div>
    </>
  );
}
