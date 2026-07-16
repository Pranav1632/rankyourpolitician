// Pure presentational bits (no hooks) - safe to use from server or client.
import { initials, avatarTint } from '@/lib/format';
import { clsx } from 'clsx';
import Icon, { type IconName } from './Icon';

export function Avatar({ name, src, size = 44 }: { name: string; src?: string; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="shrink-0 rounded-2xl object-cover shadow-soft ring-1 ring-white/70"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-2xl font-bold text-white shadow-soft ring-1 ring-white/40"
      style={{ width: size, height: size, background: avatarTint(name), fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

/** Party label as a NEUTRAL chip - never party colours (bias-safety). */
export function PartyChip({ party }: { party: string }) {
  // Show a short form when the party name is long, keep full in title.
  const short = party.replace(/\s*\(([^)]+)\)\s*$/, (_, abbr) => ` (${abbr})`);
  return (
    <span title={party} className="inline-flex items-center rounded-full bg-paper-sink px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
      {short}
    </span>
  );
}

export function Chip({ children, tone = 'neutral', icon }: { children: React.ReactNode; tone?: 'neutral' | 'perf' | 'rating' | 'brand' | 'warn'; icon?: IconName }) {
  const tones = {
    neutral: 'bg-paper-sink text-ink-soft',
    perf: 'bg-perf-soft text-perf-ink',
    rating: 'bg-rating-soft text-rating-ink',
    brand: 'bg-brand-soft text-brand-ink',
    warn: 'bg-accent-soft text-accent-ink',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

/** Frosted-glass section container - the standard content surface. */
export function SectionCard({
  title,
  subtitle,
  eyebrow,
  icon,
  aside,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  /** Small label above the title - used to name a step in an ordered ladder. */
  eyebrow?: string;
  icon?: IconName;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('glass rounded-3xl p-5 sm:p-6', className)}>
      {(title || aside) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon name={icon} size={20} />
              </span>
            )}
            <div>
              {eyebrow && (
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">{eyebrow}</p>
              )}
              {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
            </div>
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Hero stat: big count-up number over a quiet label. Pass a <CountUp> or text. */
export function StatPill({
  value,
  label,
  icon,
  tone = 'brand',
}: {
  value: React.ReactNode;
  label: string;
  icon?: IconName;
  tone?: 'brand' | 'perf' | 'rating' | 'ink';
}) {
  const tones = {
    brand: 'text-brand',
    perf: 'text-perf',
    rating: 'text-rating-ink',
    ink: 'text-ink',
  };
  return (
    <div className="glass pressable flex min-w-0 flex-col items-center rounded-2xl px-4 py-3 text-center">
      <span className={clsx('flex items-center gap-1.5 text-2xl font-extrabold tabular-nums tracking-tight sm:text-3xl', tones[tone])}>
        {icon && <Icon name={icon} size={20} className="opacity-70" />}
        {value}
      </span>
      <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint sm:text-xs">{label}</span>
    </div>
  );
}

/** Small uppercase section label with a leading icon - quiet hierarchy marker. */
export function Eyebrow({ children, icon }: { children: React.ReactNode; icon?: IconName }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
      {icon && <Icon name={icon} size={14} />}
      {children}
    </p>
  );
}

/** Standard page hero shell: breadcrumb slot, big title, subtitle, side slot. */
export function PageHero({
  crumbs,
  title,
  titleAccent,
  subtitle,
  chips,
  aside,
  children,
}: {
  crumbs?: React.ReactNode;
  title: string;
  titleAccent?: string;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden border-b border-line/70">
      <div className="mx-auto max-w-content px-4 pb-6 pt-5 sm:pb-8">
        {crumbs}
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {chips && <div className="mb-2 flex flex-wrap items-center gap-2">{chips}</div>}
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {title}
              {titleAccent && <span className="text-brand"> {titleAccent}</span>}
            </h1>
            {subtitle && <div className="mt-2 max-w-2xl text-base text-ink-soft sm:text-lg">{subtitle}</div>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
