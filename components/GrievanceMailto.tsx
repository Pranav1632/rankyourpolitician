'use client';
// Reads the ?ref= profile id in the browser so the grievance page itself can
// be fully static - reading searchParams on the server would force the whole
// route to render per request.
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function MailtoInner({ email }: { email: string }) {
  const ref = useSearchParams().get('ref') ?? undefined;
  const subject = encodeURIComponent(`Correction / Right to reply${ref ? ` - ${ref}` : ''}`);
  return (
    <>
      <a href={`mailto:${email}?subject=${subject}`}>{email}</a>
      {ref && (
        <>
          {' '}
          - regarding profile <code>{ref}</code>
        </>
      )}
    </>
  );
}

export default function GrievanceMailto({ email }: { email: string }) {
  // useSearchParams needs a Suspense boundary; the fallback is the same link
  // without the prefilled subject, so nothing jumps visually.
  return (
    <Suspense fallback={<a href={`mailto:${email}`}>{email}</a>}>
      <MailtoInner email={email} />
    </Suspense>
  );
}
