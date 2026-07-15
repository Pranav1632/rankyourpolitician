'use client';
// The interactive drill-down map. Server pages project geometry to path
// strings (lib/geo*), so this component only ever receives light data.
//  - shapes with an href navigate on click / Enter (real focusable controls)
//  - optional value → 5-step neutral-indigo choropleth (never party colours)
//  - highlighted shape(s) get the accent treatment + pulse marker
//  - glass tooltip follows the pointer; first paint staggers shapes in
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { clsx } from 'clsx';

export interface GeoMapShape {
  name: string;
  d: string;
  cx: number;
  cy: number;
  href?: string;
  /** Second tooltip line, e.g. "12 leaders" or "Lok Sabha seat". */
  sub?: string;
  /** Choropleth intensity 0..1 (normalised by the page). */
  value?: number | null;
  highlighted?: boolean;
}

const RAMP = [
  'var(--color-map-ramp-0)',
  'var(--color-map-ramp-1)',
  'var(--color-map-ramp-2)',
  'var(--color-map-ramp-3)',
  'var(--color-map-ramp-4)',
];
const TERRAIN = 'var(--color-map-terrain)';
const HIGHLIGHT = '#f97316';

function fillFor(s: GeoMapShape): string {
  if (s.highlighted) return HIGHLIGHT;
  if (!s.href) return TERRAIN;
  if (s.value == null) return RAMP[2];
  const i = Math.max(0, Math.min(RAMP.length - 1, Math.floor(s.value * RAMP.length)));
  return RAMP[i];
}

export default function GeoMap({
  shapes,
  w,
  h,
  ariaLabel,
  className,
  maxWidthClass = 'max-w-md',
  animate = true,
}: {
  shapes: GeoMapShape[];
  w: number;
  h: number;
  ariaLabel: string;
  className?: string;
  maxWidthClass?: string;
  animate?: boolean;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; shape: GeoMapShape } | null>(null);
  // Prefetch a shape's route the moment the pointer touches it, so the click
  // (or Enter) that follows navigates instantly. Set-guarded: pointermove
  // fires continuously but each href is only prefetched once.
  const prefetched = useRef<Set<string>>(new Set());

  function prefetch(href?: string) {
    if (!href || prefetched.current.has(href)) return;
    prefetched.current.add(href);
    router.prefetch(href);
  }

  function moveTip(e: React.PointerEvent, shape: GeoMapShape) {
    prefetch(shape.href);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, shape });
  }

  // Stagger cap: with hundreds of districts, spread entrances over ≤600ms.
  const step = Math.min(14, 600 / Math.max(1, shapes.length));

  return (
    <div ref={wrapRef} className={clsx('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className={clsx('mx-auto h-auto w-full drop-shadow-sm', maxWidthClass, animate && 'geo-animate')}
        role="img"
        aria-label={ariaLabel}
      >
        {shapes.map((s, i) => (
          <path
            key={`${s.name}-${i}`}
            d={s.d}
            fill={fillFor(s)}
            className={clsx('geo-path', s.href && 'geo-path--active')}
            style={animate ? ({ '--geo-delay': `${Math.round(i * step)}ms` } as React.CSSProperties) : undefined}
            tabIndex={s.href ? 0 : -1}
            role={s.href ? 'link' : undefined}
            aria-label={s.href ? `${s.name}${s.sub ? ` - ${s.sub}` : ''}` : undefined}
            onPointerMove={(e) => moveTip(e, s)}
            onPointerLeave={() => setTip(null)}
            onFocus={() => {
              prefetch(s.href);
              const rect = wrapRef.current?.getBoundingClientRect();
              if (rect) setTip({ x: (s.cx / w) * rect.width, y: (s.cy / h) * rect.height, shape: s });
            }}
            onBlur={() => setTip(null)}
            onClick={() => s.href && router.push(s.href)}
            onKeyDown={(e) => {
              if (s.href && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                router.push(s.href);
              }
            }}
          />
        ))}
        {/* Pulse marker on the highlighted shape - "you are here". */}
        {shapes
          .filter((s) => s.highlighted)
          .map((s, i) => (
            <g key={`hl-${i}`} className="pointer-events-none">
              <circle cx={s.cx} cy={s.cy} r={7} fill="none" stroke={HIGHLIGHT} strokeWidth={2} opacity={0.55}>
                <animate attributeName="r" values="5;11;5" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={s.cx} cy={s.cy} r={4} fill="#fff" stroke={HIGHLIGHT} strokeWidth={2.5} />
            </g>
          ))}
      </svg>

      {tip && (
        <div
          className="glass-dark pointer-events-none absolute z-10 max-w-[16rem] rounded-xl px-3 py-1.5 text-xs shadow-lift"
          style={{
            left: Math.max(8, Math.min(tip.x + 14, (wrapRef.current?.clientWidth ?? 300) - 120)),
            top: Math.max(4, tip.y - 44),
          }}
          role="status"
        >
          <p className="font-bold">{tip.shape.name}</p>
          {tip.shape.sub && <p className="text-white/75">{tip.shape.sub}</p>}
        </div>
      )}
    </div>
  );
}
