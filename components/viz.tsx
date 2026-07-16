// Pure visual primitives (no hooks) - big, friendly, scannable.
// Entrance animations are CSS-only (see tailwind keyframes), so these stay
// server-safe and work without JavaScript.
import Icon, { type IconName } from './Icon';
import { clsx } from 'clsx';

/** Circular progress ring for the Verified Performance percentile.
 *  `value` is a 0-100 percentile (higher = better); it is DISPLAYED as
 *  "top X%" (percentile 87 → "top 13%") so the number reads the way people
 *  say it. The arc fills with the percentile itself.
 *  The arc sweeps in on first paint (CSS `ring-fill` keyframe). */
export function ScoreRing({
  value,
  size = 132,
  label,
  sublabel,
  emptyLabel,
  color = '#0d9488',
  animate = true,
}: {
  value: number | null;
  size?: number;
  label?: string;
  sublabel?: string;
  /** Short caption shown inside the ring when there is no score. */
  emptyLabel?: string;
  color?: string;
  animate?: boolean;
}) {
  const stroke = size * 0.1;
  const r = size / 2 - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = circ * (1 - pct / 100);
  // "Top X%": percentile 87 → better than 87% of the cohort → top 13%.
  const top = value == null ? null : Math.max(1, Math.round(100 - pct));
  const aria = value == null ? (emptyLabel ?? 'No score') : `${label ? `${label} ` : ''}${top}%`;
  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={sublabel ?? aria}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-line" strokeWidth={stroke} />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className={animate ? 'animate-ring-fill' : undefined}
            style={{ ['--ring-circ' as string]: `${circ}px` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" aria-hidden>
        {value == null ? (
          <div className="px-1">
            <span className="block font-bold leading-none text-ink-faint" style={{ fontSize: size * 0.28 }}>-</span>
            {emptyLabel && (
              <span className="mt-0.5 block font-medium leading-tight text-ink-faint" style={{ fontSize: Math.max(8, size * 0.11) }}>
                {emptyLabel}
              </span>
            )}
          </div>
        ) : (
          <div>
            {label && (
              <div className="font-bold uppercase tracking-wide text-ink-faint" style={{ fontSize: Math.max(8, size * 0.11) }}>
                {label}
              </div>
            )}
            <div className="font-extrabold leading-none tabular-nums" style={{ color, fontSize: size * 0.28 }}>
              {top}
              <span className="font-bold" style={{ fontSize: size * 0.16 }}>%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Star rating for Public Rating (amber). Rounds to nearest for a clean read. */
export function Stars({ value, size = 22 }: { value: number | null; size?: number }) {
  const filled = value == null ? 0 : Math.round(value);
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={value == null ? 'No rating yet' : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          size={size}
          className={n <= filled ? 'text-rating' : 'text-line'}
          style={{ fill: n <= filled ? '#f59e0b' : 'transparent' }}
        />
      ))}
    </div>
  );
}

/** Metric tile: icon + big number + label + context. Very scannable. */
export function StatTile({
  icon,
  value,
  label,
  hint,
  accent = 'perf',
}: {
  icon: IconName;
  value: string;
  label: string;
  hint?: React.ReactNode;
  accent?: 'perf' | 'rating' | 'brand' | 'ink';
}) {
  const tint = {
    perf: 'bg-perf-soft text-perf',
    rating: 'bg-rating-soft text-rating-ink',
    brand: 'bg-brand-soft text-brand',
    ink: 'bg-paper-sink text-ink-soft',
  }[accent];
  return (
    <div className="glass pressable rounded-2xl p-4">
      <span className={clsx('inline-grid h-9 w-9 place-items-center rounded-xl', tint)}>
        <Icon name={icon} size={20} />
      </span>
      <div className="mt-2.5 text-2xl font-extrabold tabular-nums text-ink">{value}</div>
      <div className="text-sm font-medium text-ink-soft">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

/** Rank medal: gold/silver/bronze for top 3, else a soft circle.
 *  `rank: null` → an unranked entry (not enough data): a neutral dash, so a
 *  data gap is never displayed as a low rank. */
export function RankBadge({ rank }: { rank: number | null }) {
  const medal =
    rank === 1
      ? 'bg-gradient-to-br from-[#ffe28a] to-[#f0b429] text-[#6b4e00] shadow-soft'
      : rank === 2
        ? 'bg-gradient-to-br from-[#e8ecf2] to-[#c3cbd6] text-[#414a59] shadow-soft'
        : rank === 3
          ? 'bg-gradient-to-br from-[#f3c39a] to-[#dd9257] text-[#6b350e] shadow-soft'
          : 'bg-paper-sink text-ink-faint';
  return (
    <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold', medal)}>
      {rank ?? '-'}
    </span>
  );
}

/** Horizontal meter for a single metric - fills in on first paint. */
export function Meter({ value, label, value2, color = '#0d9488' }: { value: number | null; label: string; value2?: string; color?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink-soft">{label}</span>
        {value2 && <span className="text-sm font-bold tabular-nums" style={{ color }}>{value2}</span>}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-paper-sink">
        <div className="h-full animate-meter-fill rounded-full" style={{ width: `${value ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

/** Proportional composition bar (e.g. house seats by party) with a legend.
 *  Neutral tints only - parties are NEVER given their brand colours. */
export function CompositionBar({
  segments,
  total,
  ariaLabel,
}: {
  segments: { label: string; count: number }[];
  total: number;
  ariaLabel: string;
}) {
  // Neutral, colourblind-distinct tints (no party identity implied).
  const TINTS = ['#6366f1', '#0d9488', '#f59e0b', '#64748b', '#a855f7', '#0ea5e9', '#84cc16', '#f43f5e', '#78716c', '#14b8a6'];
  const known = segments.reduce((s, x) => s + x.count, 0);
  const rest = Math.max(0, total - known);
  return (
    <div>
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-paper-sink ring-1 ring-line"
        role="img"
        aria-label={ariaLabel}
      >
        {segments.map((s, i) => (
          <div
            key={s.label}
            className="h-full animate-meter-fill"
            style={{ width: `${(s.count / total) * 100}%`, background: TINTS[i % TINTS.length], animationDelay: `${i * 60}ms` }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
        {rest > 0 && <div className="h-full" style={{ width: `${(rest / total) * 100}%` }} />}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: TINTS[i % TINTS.length] }} aria-hidden />
            <span className="font-semibold text-ink">{s.label}</span>
            <span className="tabular-nums text-ink-faint">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
