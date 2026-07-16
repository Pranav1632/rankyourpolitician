'use client';
// A helpline number that behaves correctly on every device. tel: is right on a
// phone - tap, dial, done - but on a desktop it dead-ends in an "open an
// application?" dialog most users cannot act on. So on devices without a coarse
// pointer the click goes to the official page that PUBLISHES the number instead,
// in a new tab: the citizen still reaches the helpline, with its full context.
// The decision happens at click time (not render), so server HTML stays
// identical and hydration never mismatches.
import type { MouseEvent, ReactNode } from 'react';
import { telHref } from '@/lib/contacts';

export default function PhoneLink({
  value,
  sourceUrl,
  className,
  children,
}: {
  /** The phone number (any formatting; digits are extracted for tel:). */
  value: string;
  /** Official page publishing this number - the desktop click target. */
  sourceUrl?: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Coarse pointer = touch device = native dialler exists; keep tel:.
    if (window.matchMedia?.('(any-pointer: coarse)').matches) return;
    if (!sourceUrl) return; // nothing better to offer - keep default behaviour
    e.preventDefault();
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  };
  return (
    <a href={telHref(value)} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
