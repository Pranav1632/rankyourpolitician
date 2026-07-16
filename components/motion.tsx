'use client';
// Scroll-reveal + count-up primitives. Server-rendered content stays fully
// visible without JS (the hidden state is only applied once JS marks the
// element "pending"), so SEO and no-JS users are never penalised.
import { useEffect, useRef, useState, type ReactNode } from 'react';

let sharedObserver: IntersectionObserver | null = null;
const shownCallbacks = new WeakMap<Element, () => void>();

/** Run a callback the first time an element scrolls into view, via one shared
 *  IntersectionObserver. Exported for lazy-fetch widgets (e.g. GeoTrending) so
 *  they piggyback on this observer instead of creating their own. */
export function observe(el: Element, onShown: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    onShown();
    return () => {};
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            shownCallbacks.get(e.target)?.();
            sharedObserver!.unobserve(e.target);
            shownCallbacks.delete(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
  }
  shownCallbacks.set(el, onShown);
  sharedObserver.observe(el);
  return () => {
    sharedObserver?.unobserve(el);
    shownCallbacks.delete(el);
  };
}

/** Fade-up the wrapped block when it scrolls into view. `delay` staggers (ms). */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<'idle' | 'pending' | 'shown'>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already on screen at hydration → skip the hide/show cycle entirely.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      setState('shown');
      return;
    }
    setState('pending');
    return observe(el, () => setState('shown'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tag
      ref={ref as any}
      data-reveal={state === 'idle' ? undefined : state}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
      className={className}
    >
      {children}
    </Tag>
  );
}

/** Animated integer counter. Renders the final value server-side (SEO-safe),
 *  then counts up from 0 the first time it becomes visible. */
export function CountUp({
  value,
  duration = 1200,
  className,
  format,
}: {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = format ?? ((n: number) => n.toLocaleString('en-IN'));

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return observe(el, () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(value * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}
