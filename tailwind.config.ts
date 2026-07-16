import type { Config } from 'tailwindcss';

/**
 * Warm, friendly, non-partisan civic palette — deliberately avoids party colours
 * as dominant hues. Two ranking axes use distinct, colourblind-safe families:
 * teal = Verified Performance, amber = Public Rating.
 *
 * v2 adds the "glass" layer: frosted surfaces over a soft aurora background,
 * spring-feel motion keyframes, and a display type scale.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--color-ink-faint) / <alpha-value>)',
        },
        paper: {
          DEFAULT: 'rgb(var(--color-paper) / <alpha-value>)',
          soft: 'rgb(var(--color-paper-soft) / <alpha-value>)',
          sink: 'rgb(var(--color-paper-sink) / <alpha-value>)',
        },
        line: 'rgb(var(--color-line) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          ink: 'rgb(var(--color-brand-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-brand-soft) / <alpha-value>)',
          deep: 'rgb(var(--color-brand-deep) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          ink: 'rgb(var(--color-accent-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-accent-soft) / <alpha-value>)',
        },
        perf: {
          DEFAULT: 'rgb(var(--color-perf) / <alpha-value>)',
          ink: 'rgb(var(--color-perf-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-perf-soft) / <alpha-value>)',
        },
        rating: {
          DEFAULT: 'rgb(var(--color-rating) / <alpha-value>)',
          ink: 'rgb(var(--color-rating-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-rating-soft) / <alpha-value>)',
        },
        good: '#16a34a',
        bad: '#dc2626',
        warn: '#d97706',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        base: ['1.0625rem', { lineHeight: '1.6' }],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28,32,42,0.04), 0 8px 24px rgba(28,32,42,0.06)',
        lift: '0 2px 4px rgba(28,32,42,0.05), 0 16px 40px rgba(28,32,42,0.10)',
        glass: '0 1px 1px rgba(255,255,255,0.6) inset, 0 1px 2px rgba(28,32,42,0.04), 0 12px 32px rgba(49,46,129,0.08)',
        glow: '0 0 0 1px rgba(79,70,229,0.12), 0 12px 40px rgba(79,70,229,0.18)',
        'tab-bar': '0 -8px 30px rgba(28,32,42,0.08)',
      },
      maxWidth: { content: '75rem' },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)', // iOS-style deceleration
      },
      keyframes: {
        // Entrance keyframes END at `transform: none` (not an identity transform):
        // with fill-mode `both`, a persisted translateY(0)/scale(1) keeps a
        // STACKING CONTEXT alive on the element forever — which made later
        // animated siblings (stat pills, map) paint OVER the search dropdown.
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'ring-fill': {
          from: { strokeDashoffset: 'var(--ring-circ)' },
        },
        'meter-fill': {
          from: { width: '0%' },
        },
        'map-in': {
          from: { opacity: '0', transform: 'scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        'aurora-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(2%, -3%) scale(1.05)' },
          '66%': { transform: 'translate(-2%, 2%) scale(0.98)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.4)' },
          '70%': { transform: 'scale(1.15)' },
          '100%': { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.32,0.72,0,1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.45s cubic-bezier(0.32,0.72,0,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'ring-fill': 'ring-fill 1.1s cubic-bezier(0.32,0.72,0,1) both',
        'meter-fill': 'meter-fill 0.9s cubic-bezier(0.32,0.72,0,1) both',
        'map-in': 'map-in 0.7s cubic-bezier(0.32,0.72,0,1) both',
        'aurora-drift': 'aurora-drift 24s ease-in-out infinite',
        'pop-in': 'pop-in 0.5s cubic-bezier(0.32,0.72,0,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
