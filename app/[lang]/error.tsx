'use client';
import { useEffect } from 'react';

// Error boundaries must be Client Components.
// Intentionally keeps labels in English: this component fires before the
// i18n runtime is guaranteed to be available, and a localised crash screen
// would itself risk crashing on a translation miss.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error reporting service in the future.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="glass flex flex-col items-center gap-4 rounded-3xl p-8">
        <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-500 dark:bg-amber-900/30">
          <svg
            width={28}
            height={28}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4l9 16H3L12 4z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
        </span>
        <div>
          <h1 className="text-xl font-bold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-soft">
            An unexpected error occurred while loading this page. Please try again.
          </p>
          {error.digest && (
            <p className="mt-1 font-mono text-xs text-ink-faint">Ref: {error.digest}</p>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          className="pressable mt-2 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-brand/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
