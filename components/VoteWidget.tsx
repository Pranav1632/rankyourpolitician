'use client';
import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import { useI18n } from '@/lib/i18n/provider';
import { Stars } from '@/components/viz';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface Sentiment {
  mean: number | null;
  votes: number;
  distribution: Record<string, number>;
  confidence: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset?: (id?: string) => void;
    };
  }
}

// A small, privacy-light device fingerprint used ONLY as a soft dedupe signal.
function deviceFingerprint(): string {
  try {
    const bits = [
      navigator.language,
      new Date().getTimezoneOffset(),
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      navigator.hardwareConcurrency,
      navigator.platform,
    ].join('|');
    let h = 0;
    for (let i = 0; i < bits.length; i++) h = (h * 31 + bits.charCodeAt(i)) >>> 0;
    return h.toString(36);
  } catch {
    return 'na';
  }
}

export default function VoteWidget({
  politicianId,
  initial,
}: {
  politicianId: string;
  initial: Sentiment;
}) {
  const { t } = useI18n();
  const [sentiment, setSentiment] = useState<Sentiment>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [previousRating, setPreviousRating] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const fpRef = useRef('');
  const tsRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    fpRef.current = deviceFingerprint();
    try {
      const prev = localStorage.getItem(`vote:${politicianId}`);
      if (prev) {
        const val = Number(prev);
        setSelected(val);
        setPreviousRating(val);
      } else {
        setPreviousRating(null);
      }
    } catch {}
  }, [politicianId]);

  // The page HTML is ISR-cached for up to a day, so the server-rendered score
  // can be stale. Refresh it from the live aggregate on mount (the GET is
  // CDN-cached for 5 minutes); on any failure keep the server-rendered numbers.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vote?politicianId=${encodeURIComponent(politicianId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.sentiment) setSentiment(data.sentiment);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [politicianId]);

  function renderTurnstile() {
    if (!SITE_KEY || !tsRef.current || !window.turnstile) return;
    if (widgetIdRef.current != null) return; // render() twice on one element throws
    widgetIdRef.current = window.turnstile.render(tsRef.current, {
      sitekey: SITE_KEY,
      callback: (tok: string) => setToken(tok),
      // Tokens expire after ~5 min; clear ours so submit() asks for a redo
      // instead of sending a dead token the server will reject.
      'expired-callback': () => setToken(''),
      theme: 'light',
    });
  }

  // The turnstile script survives client-side navigations, so <Script onLoad>
  // only fires on the FIRST page that loads it - every later person page must
  // render the widget itself on mount, or voting silently breaks.
  useEffect(() => {
    renderTurnstile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Turnstile tokens are single-use: after any round-trip to the server the
   *  current token is spent, so reset the widget to mint a fresh one (lets the
   *  voter change their rating without reloading the page). */
  function resetTurnstile() {
    if (!SITE_KEY) return;
    setToken('');
    try {
      if (widgetIdRef.current != null) window.turnstile?.reset?.(widgetIdRef.current);
    } catch {}
  }

  async function submit() {
    if (selected == null) return;
    if (SITE_KEY && !token) {
      setStatus('error');
      setMessage(t('vote.errorBot'));
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          politicianId,
          rating: selected,
          fingerprint: fpRef.current,
          turnstileToken: token,
        }),
      });
      const data = await res.json();
      // The server has now consumed the token whether it accepted the vote or
      // not - mint a fresh one so the voter can retry / change their rating.
      resetTurnstile();
      if (!res.ok) {
        setStatus('error');
        setMessage(
          data.error === 'rate-limited'
            ? t('vote.errorRate')
            : data.error === 'captcha'
              ? t('vote.errorBot')
              : t('vote.errorGeneric'),
        );
        return;
      }
      setSentiment(data.sentiment);
      setStatus('done');
      setPreviousRating(selected);
      setMessage(data.updated ? t('vote.already') : t('vote.thanks'));
      try {
        localStorage.setItem(`vote:${politicianId}`, String(selected));
      } catch {}
    } catch {
      resetTurnstile();
      setStatus('error');
      setMessage(t('vote.errorGeneric'));
    }
  }

  const labels = [t('vote.scale1'), '', '', '', t('vote.scale5')];
  const confKey =
    'vote.confidence' + sentiment.confidence.charAt(0).toUpperCase() + sentiment.confidence.slice(1);
  // "1 ratings" reads as a bug; t() has no plural support, so pick the form.
  const votesLabel =
    sentiment.votes === 0
      ? t('vote.confidenceNone')
      : sentiment.votes === 1
        ? t('ranking.voteOne')
        : t('ranking.votes', { n: sentiment.votes });

  return (
    <div>
      {SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={renderTurnstile}
        />
      )}

      {/* The plain average of the votes cast - NOT the Bayesian score used for
          ordering. This sits directly above the vote breakdown, so a shrunk
          number here would visibly contradict it (five 1-star votes reading
          as "2.3"). Thin samples are conveyed by the vote count + confidence,
          not by silently moving the number toward neutral. */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-4xl font-extrabold text-rating-ink">{sentiment.mean != null ? sentiment.mean.toFixed(1) : '-'}</span>
        <div>
          <Stars value={sentiment.mean} size={20} />
          <p className="mt-0.5 text-xs text-ink-faint">{votesLabel}</p>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">{t('vote.prompt')}</p>

      <div className="mt-3 flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setSelected(n)}
            aria-pressed={selected === n}
            aria-label={`${n} ${labels[n - 1] || ''}`.trim()}
            // Selected = a SOLID fill, matching how every other active chip on the
            // site reads. `rating-ink` (not plain amber) because white text on
            // #f59e0b is only 2.15:1 - it fails WCAG AA; #b45309 gives 5.02:1 for
            // the label AND 5.02:1 against the unselected white buttons, so the
            // choice is obvious at a glance and without relying on hue alone.
            className={`grid h-10 w-10 place-items-center rounded-lg border text-sm font-semibold transition ${
              selected === n
                ? 'border-rating-ink bg-rating-ink text-white dark:text-zinc-950 shadow-soft ring-2 ring-rating/40'
                : 'border-line bg-white text-ink-soft hover:border-rating hover:bg-rating-soft'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-faint" style={{ maxWidth: '17rem' }}>
        <span>{t('vote.scale1')}</span>
        <span>{t('vote.scale5')}</span>
      </div>

      {previousRating !== null && (
        <p className="mt-2 text-xs font-semibold text-brand-ink/80 dark:text-brand-ink/90">
          {t('vote.alreadyVotedHint', { rating: previousRating })}
        </p>
      )}

      {SITE_KEY && <div ref={tsRef} className="mt-3" />}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={selected == null || status === 'submitting'}
          className="rounded-lg bg-rating-ink px-4 py-2 text-sm font-semibold text-white dark:text-zinc-950 transition hover:bg-rating-ink/90 disabled:opacity-50"
        >
          {status === 'submitting' ? t('vote.submitting') : t('vote.submit')}
        </button>
        {message && (
          <span className={`text-sm ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-good dark:text-green-400'}`}>{message}</span>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-faint">{t('vote.oncePerPerson')} · {t('vote.notVerifiedNote')}</p>

      {/* Distribution */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-ink-faint">
          <span>{t('vote.distribution')}</span>
          <span>
            {t('vote.confidence')}: {t(confKey)}
          </span>
        </div>
        {sentiment.votes === 0 ? (
          <p className="text-sm text-ink-faint">{t('vote.confidenceNone')}</p>
        ) : (
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = sentiment.distribution[n] || 0;
              const pct = sentiment.votes ? Math.round((c / sentiment.votes) * 100) : 0;
              return (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-ink-faint">{n}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-sink">
                    <div className="h-full rounded-full bg-rating" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-ink-faint">{c}</span>
                </div>
              );
            })}
            <p className="pt-1 text-right text-xs text-ink-faint">
              {sentiment.mean != null && `${sentiment.mean.toFixed(1)}/5 · `}
              {votesLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
