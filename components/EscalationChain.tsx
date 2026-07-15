import Icon from './Icon';
import type { EscalationChainDef } from '@/lib/escalation';

export interface EscalationChainLabels {
  startHere: string;
  escalate: string; // "If unresolved, escalate to"
  covers: string; // "Covers"
  thisOffice: string; // "This office"
  varies: string; // "How this varies by state"
  sources: string; // "Sources"
}

/**
 * Presentational (no i18n hook) so it works in both the client Finder and the
 * server OfficialProfile - the caller passes translated `labels`. Renders the
 * chain of appointed officials as a top-to-bottom escalation ladder: the
 * citizen-facing office first, each higher authority below.
 */
export default function EscalationChain({
  chain,
  highlightRungId,
  labels,
}: {
  chain: EscalationChainDef;
  highlightRungId?: string;
  labels: EscalationChainLabels;
}) {
  return (
    <div>
      <ol className="relative space-y-2.5">
        {chain.rungs.map((r, i) => {
          const isStart = i === chain.citizenStartIndex;
          const isHere = r.id === highlightRungId;
          const isLast = i === chain.rungs.length - 1;
          return (
            <li key={r.id}>
              <div
                className={`rounded-2xl border p-3.5 ${
                  isHere ? 'border-brand bg-brand-soft/50 shadow-soft' : 'border-line bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                      isHere ? 'bg-brand text-white' : 'bg-paper-sink text-ink-faint'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-bold text-ink">{r.short}</span>
                      {isStart && (
                        <span className="rounded-full bg-perf-soft px-2 py-0.5 text-[11px] font-semibold text-perf-ink">
                          {labels.startHere}
                        </span>
                      )}
                      {isHere && (
                        <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
                          {labels.thisOffice}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-ink-soft">{r.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
                      <Icon name="pin" size={12} /> {labels.covers}: {r.jurisdiction}
                    </p>
                    <p className="mt-1.5 text-sm text-ink-soft">{r.handles}</p>
                  </div>
                </div>
                {!isLast && r.escalateWhen && (
                  <div className="mt-2.5 flex items-start gap-1.5 border-t border-dashed border-line pt-2.5 text-xs text-ink-faint">
                    <Icon name="arrow" size={13} className="mt-0.5 shrink-0 -rotate-90 text-accent-ink" />
                    <span>
                      <span className="font-semibold">{labels.escalate}: </span>
                      {r.escalateWhen}
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {chain.variesNote && (
        <details className="mt-3 rounded-xl border border-line bg-paper-soft">
          <summary className="flex cursor-pointer items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold text-ink-soft">
            <Icon name="info" size={14} className="text-ink-faint" /> {labels.varies}
          </summary>
          <p className="px-3.5 pb-3 text-sm text-ink-soft">{chain.variesNote}</p>
        </details>
      )}

      {chain.sources && chain.sources.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-faint">
          <span className="font-semibold">{labels.sources}:</span>
          {chain.sources.map((s, i) => {
            let host = s;
            try {
              host = new URL(s).hostname.replace(/^www\./, '');
            } catch {
              /* keep raw */
            }
            return (
              <a
                key={i}
                href={s}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand hover:underline"
              >
                {host}
              </a>
            );
          })}
        </p>
      )}
    </div>
  );
}
