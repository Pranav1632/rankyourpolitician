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
import { operatorGroupsForProblem, districtDirectory, formatPhone, type OperatorGroup } from '@/lib/contacts';
import { useI18n } from '@/lib/i18n/provider';
import Icon from './Icon';
import PhoneLink from './PhoneLink';

function Row({
  icon,
  href,
  label,
  sub,
  external,
  phone,
}: {
  icon: 'phone' | 'mail' | 'link' | 'law';
  href?: string;
  label: string;
  sub?: string;
  external?: boolean;
  /** Render as a device-aware phone link instead of a plain anchor. */
  phone?: { value: string; sourceUrl?: string };
}) {
  const cls = 'flex items-center gap-2.5 rounded-xl border border-line/60 bg-white/70 px-3 py-2 hover:border-brand/40 hover:bg-brand-soft/40';
  const inner = (
    <>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon name={icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{label}</span>
        {sub && <span className="block truncate text-[11px] text-ink-faint">{sub}</span>}
      </span>
      <Icon name={external ? 'arrow' : 'chevron'} size={13} className={`shrink-0 text-ink-faint ${external ? '' : '-rotate-90'}`} />
    </>
  );
  if (phone) {
    return (
      <PhoneLink value={phone.value} sourceUrl={phone.sourceUrl} className={cls}>
        {inner}
      </PhoneLink>
    );
  }
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={cls}>
      {inner}
    </a>
  );
}

/** One clickable way in - a number to dial, an address to write to, a portal
 *  to open - rendered as a small chip inside its organisation's card. */
function ActionChip({ c }: { c: ContactChannel }) {
  const cls =
    'inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line/70 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-ink hover:border-brand/50 hover:bg-brand-soft/40';
  const icon = c.kind === 'phone' ? 'phone' : c.kind === 'email' ? 'mail' : 'link';
  let text = c.value;
  if (c.kind === 'phone') text = formatPhone(c.value);
  if (c.kind === 'url') {
    try {
      text = new URL(c.value).hostname.replace(/^www\./, '');
    } catch {
      /* keep raw */
    }
  }
  const inner = (
    <>
      <Icon name={icon} size={12} className="shrink-0 text-brand" />
      <span className="truncate">{text}</span>
    </>
  );
  if (c.kind === 'phone') {
    return (
      <PhoneLink value={c.value} sourceUrl={c.source_url} className={cls}>
        {inner}
      </PhoneLink>
    );
  }
  if (c.kind === 'email') {
    return (
      <a href={`mailto:${c.value}`} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <a href={c.value} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  );
}

/** An organisation's card: who it is, whether it serves THIS area, and its
 *  phone / email / portal as separate actions. */
function OperatorCard({ group, showsLocal }: { group: OperatorGroup; showsLocal: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`rounded-xl border px-3 py-2 ${group.local ? 'border-brand/40 bg-brand-soft/30' : 'border-line/60 bg-white/70'}`}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-ink">{group.title}</span>
        {group.local ? (
          <span className="shrink-0 rounded-full bg-perf-soft px-2 py-0.5 text-[10px] font-bold text-perf-ink">
            {t('contacts.servesArea')}
          </span>
        ) : (
          <span className="shrink-0 pt-0.5 text-[10px] font-semibold text-ink-faint">
            {group.scope === 'state' ? t('contacts.stateScope') : t('contacts.nationalScope')}
          </span>
        )}
      </div>
      {/* When another card in the list is a verified local operator, an untagged
          statewide card gains a one-line hint from its own label so the reader
          can tell the two apart (the title alone may not say the area). */}
      {!group.local && showsLocal && group.title !== group.channels[0].label && (
        <p className="mt-0.5 truncate text-[11px] text-ink-faint">{group.channels[0].label}</p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {group.channels.map((c) => (
          <ActionChip key={`${c.kind}:${c.value}`} c={c} />
        ))}
      </div>
    </div>
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
  // One card per organisation; every operator verified to serve this district
  // is included (areas with several providers must show ALL of them).
  const groups = operatorGroupsForProblem(channels ?? [], problem, district);
  const anyLocal = groups.some((g) => g.local);
  // Only needed when this district has no verified site of its own.
  const directory = portal ? undefined : districtDirectory(channels);
  if (!portal && !directory && groups.length === 0) return null;

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
        <Row
          icon="phone"
          phone={{ value: portal.phone, sourceUrl: portal.contactUrl || portal.url }}
          label={formatPhone(portal.phone)}
          sub={t('contacts.collectorate')}
        />
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

      {groups.map((g) => (
        <OperatorCard key={`${g.scope}:${g.title}`} group={g} showsLocal={anyLocal} />
      ))}

      <p className="pt-0.5 text-[11px] text-ink-faint">{t('contacts.sourceNote')}</p>
    </div>
  );
}
