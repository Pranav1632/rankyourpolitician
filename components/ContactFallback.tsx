'use client';
// What to show on a rung of the accountability ladder when we cannot name the
// officer - which, for District Magistrates and SPs, is most of India's ~600
// districts.
//
// The old behaviour was a dead end: "Currently unknown", nothing else. That is
// the worst possible answer, because the citizen still has the problem. So
// instead of a name we give the durable, citable ways in:
//   1. the district's OWN Who's Who directory - the district maintains it, so it
//      names the current collector even though we don't
//   2. the collectorate phone/email printed on that site
//   3. the state helpline / grievance portal, then the national helpline
// Every item is something an official source publishes; nothing here is guessed.
import type { ContactChannel, ProblemType } from '@/lib/types';
import type { WhoPortal } from '@/lib/responsibility';
import { channelsForProblem, districtDirectory, telHref, formatPhone } from '@/lib/contacts';
import { useI18n } from '@/lib/i18n/provider';
import Icon from './Icon';

function Row({
  icon,
  href,
  label,
  sub,
  external,
}: {
  icon: 'phone' | 'mail' | 'link' | 'law';
  href: string;
  label: string;
  sub?: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-center gap-2.5 rounded-xl border border-line/60 bg-white/70 px-3 py-2 hover:border-brand/40 hover:bg-brand-soft/40"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon name={icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{label}</span>
        {sub && <span className="block truncate text-[11px] text-ink-faint">{sub}</span>}
      </span>
      <Icon name={external ? 'arrow' : 'chevron'} size={13} className={`shrink-0 text-ink-faint ${external ? '' : '-rotate-90'}`} />
    </a>
  );
}

export default function ContactFallback({
  portal,
  channels,
  problem,
  district,
  className = '',
}: {
  portal?: WhoPortal;
  channels?: ContactChannel[];
  problem: ProblemType;
  district?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const picks = channelsForProblem(channels ?? [], problem, 3);
  // Only needed when this district has no verified site of its own.
  const directory = portal ? undefined : districtDirectory(channels);
  if (!portal && !directory && picks.length === 0) return null;

  return (
    <div className={`mt-2 space-y-1.5 ${className}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">{t('contacts.reachTitle')}</p>

      {/* The district's own directory first: it is the only source that reliably
          names the officer currently in post. */}
      {portal?.whosWhoUrl && (
        <Row
          icon="law"
          href={portal.whosWhoUrl}
          label={t('contacts.whosWho')}
          sub={district ? t('contacts.whosWhoSub', { district }) : undefined}
          external
        />
      )}
      {portal?.phone && (
        <Row icon="phone" href={telHref(portal.phone)} label={formatPhone(portal.phone)} sub={t('contacts.collectorate')} />
      )}
      {portal?.email && <Row icon="mail" href={`mailto:${portal.email}`} label={portal.email} sub={t('contacts.collectorate')} />}
      {portal && !portal.whosWhoUrl && (
        <Row icon="link" href={portal.contactUrl || portal.url} label={t('contacts.districtSite')} sub={district} external />
      )}

      {/* No verified site for this district → the state's own directory of
          district websites, so there is still a route to the collectorate. */}
      {directory && (
        <Row icon="law" href={directory.value} label={t('contacts.districtDirectory')} sub={directory.label} external />
      )}

      {picks.map((c) => (
        <Row
          key={`${c.kind}:${c.value}`}
          icon={c.kind === 'phone' ? 'phone' : 'link'}
          href={c.kind === 'phone' ? telHref(c.value) : c.value}
          label={c.kind === 'phone' ? `${formatPhone(c.value)} · ${c.label}` : c.label}
          sub={c.scope === 'state' ? t('contacts.stateScope') : t('contacts.nationalScope')}
          external={c.kind === 'url'}
        />
      ))}

      <p className="pt-0.5 text-[11px] text-ink-faint">{t('contacts.sourceNote')}</p>
    </div>
  );
}
