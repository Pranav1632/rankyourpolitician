import Link from 'next/link';
import type { Metadata } from 'next';
import { getCentralGovernment, getConstitutionalOffices, getNationalStats } from '@/lib/data';
import { getI18n, type LangParams } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { MINISTER_RANK_LABEL, type ConstitutionalOffice, type Minister, type MinisterRank } from '@/lib/types';
import Breadcrumbs from '@/components/Breadcrumbs';
import HierarchyLadder from '@/components/HierarchyLadder';
import { Avatar, PartyChip, Chip, StatPill, SectionCard } from '@/components/ui';
import { CompositionBar } from '@/components/viz';
import { Reveal, CountUp } from '@/components/motion';
import Icon from '@/components/Icon';
import LastUpdated from '@/components/LastUpdated';
import AdSlot from '@/components/AdSlot';

// Daily self-heal only - content changes arrive via deploy or /api/revalidate,
// and every ISR regeneration is a billed write (see README "How data flows").
export const revalidate = 86400;
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';
export const metadata: Metadata = {
  title: 'Government of India - Prime Minister & Union Ministers',
  description: 'The Prime Minister and Union Council of Ministers of India, with the national departments each one handles.',
};

export default async function IndiaPage({ params }: { params: Promise<LangParams> }) {
  const [ministers, stats, constitutional] = await Promise.all([
    getCentralGovernment(),
    getNationalStats(),
    getConstitutionalOffices(),
  ]);
  const { dict } = await getI18n((await params).lang);
  const tr = (k: string, v?: Record<string, string | number>) => t(dict, k, v);

  const by = (r: MinisterRank) => ministers.filter((m) => m.rank === r);
  const pm = by('PM');
  const cabinet = by('Cabinet');
  const mosIc = by('MoS-IC');
  const mos = by('MoS');
  const updated = ministers.map((m) => m.retrieved_date).filter(Boolean).sort().pop();

  return (
    <div className="mx-auto max-w-content px-4 py-6">
      <Breadcrumbs items={[{ label: tr('levels.national'), href: '/' }, { label: tr('central.title') }]} />

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{tr('central.title')}</h1>
          <p className="mt-2 max-w-2xl text-lg text-ink-soft">{tr('central.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <StatPill value={<CountUp value={stats.lokSabha} />} label={tr('hierarchyPage.chipLokSabha')} tone="brand" />
          <StatPill value={<CountUp value={stats.rajyaSabha} />} label={tr('hierarchyPage.chipRajyaSabha')} tone="ink" />
          <StatPill value={<CountUp value={ministers.length} />} label={tr('hierarchyPage.chipMinisters')} tone="rating" />
        </div>
      </div>
      <div className="mt-2"><LastUpdated date={updated} /></div>

      <div className="mt-5">
        <HierarchyLadder current="national" />
      </div>

      <Reveal className="mt-6">
        <SectionCard title={tr('india.compositionTitle')} subtitle={tr('india.compositionHelp')} icon="people">
          <CompositionBar
            segments={stats.lokSabhaComposition.segments}
            total={stats.lokSabhaComposition.total}
            ariaLabel={tr('india.compositionTitle')}
          />
        </SectionCard>
      </Reveal>

      {/* The Republic's frame around the government: Head of State, presiding
          officers, and the statutory Opposition leaders. Info-only, never rated. */}
      {constitutional.length > 0 && (
        <Reveal className="mt-6">
          <SectionCard title={tr('india.constitutionalTitle')} subtitle={tr('india.constitutionalHelp')} icon="law">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {constitutional.map((o) => (
                <ConstitutionalCard key={o.id} o={o} tr={tr} />
              ))}
            </div>
          </SectionCard>
        </Reveal>
      )}

      {ministers.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line bg-white p-8 text-center shadow-soft">
          <span className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Icon name="parliament" size={26} />
          </span>
          <p className="mt-3 font-semibold text-ink">{tr('central.comingSoon')}</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {pm.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('central.pm')}</h2>
              {pm.map((m) => (
                <MinisterCard key={m.id} m={m} tr={tr} featured />
              ))}
            </section>
          )}
          {cabinet.length > 0 && (
            <Group title={tr('central.cabinet')} ministers={cabinet} tr={tr} />
          )}
          {mosIc.length > 0 && (
            <Group title={tr('central.mosIc')} ministers={mosIc} tr={tr} />
          )}
          {mos.length > 0 && (
            <Group title={tr('central.mos')} ministers={mos} tr={tr} />
          )}
        </div>
      )}

      <div className="mt-8">
        <AdSlot />
      </div>
    </div>
  );
}

function ConstitutionalCard({ o, tr }: { o: ConstitutionalOffice; tr: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <div className="relative flex h-full gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:border-brand/40 hover:shadow-lift">
      <Avatar name={o.name} src={o.photo_url} size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand">{o.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {o.politicianId ? (
            <Link href={`/person/${o.politicianId}`} className="font-bold text-ink after:absolute after:inset-0">
              {o.name}
            </Link>
          ) : (
            <span className="font-bold text-ink">{o.name}</span>
          )}
          {o.party && <PartyChip party={o.party} />}
        </div>
        {o.note && <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{o.note}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
          {o.since && <span>{tr('profile.since')} {o.since}</span>}
          <a href={o.source_url} target="_blank" rel="noopener noreferrer nofollow" className="relative z-10 inline-flex items-center gap-1 text-brand hover:underline">
            <Icon name="link" size={12} /> {o.source_name}
          </a>
        </div>
      </div>
    </div>
  );
}

function Group({ title, ministers, tr }: { title: string; ministers: Minister[]; tr: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ministers.map((m) => (
          <MinisterCard key={m.id} m={m} tr={tr} />
        ))}
      </div>
    </section>
  );
}

function MinisterCard({ m, tr, featured }: { m: Minister; tr: (k: string, v?: Record<string, string | number>) => string; featured?: boolean }) {
  // Stretched-link pattern: the whole card is clickable via the name link's
  // ::after overlay, while the source <a> stays above it (relative z-10).
  // This avoids nesting <a> inside <a> (an HTML/hydration error).
  const personId = m.politicianId || m.id;
  return (
    <div className={`relative flex h-full gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:border-brand/40 hover:shadow-lift ${featured ? 'sm:p-5' : ''}`}>
      <Avatar name={m.name} src={m.photo_url} size={featured ? 64 : 48} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/person/${personId}`} className={`font-bold text-ink after:absolute after:inset-0 ${featured ? 'text-xl' : ''}`}>
            {m.name}
          </Link>
          <PartyChip party={m.party} />
        </div>
        <p className="mt-0.5 text-xs font-medium text-ink-faint">{MINISTER_RANK_LABEL[m.rank]}</p>
        {m.portfolios.length > 0 && (
          <div className="mt-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{tr('central.holds')}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {m.portfolios.map((p) => (
                <Chip key={p} tone="brand">{p}</Chip>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
          {m.constituency && (
            <span className="flex items-center gap-1"><Icon name="pin" size={12} /> {m.constituency}{m.state ? `, ${m.state}` : ''}</span>
          )}
          {m.source_url && (
            <a href={m.source_url} target="_blank" rel="noopener noreferrer nofollow" className="relative z-10 inline-flex items-center gap-1 text-brand hover:underline">
              <Icon name="link" size={12} /> {m.source_name}
            </a>
          )}
          <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-brand">{tr('common.viewProfile')} <Icon name="arrow" size={12} /></span>
        </div>
      </div>
    </div>
  );
}
