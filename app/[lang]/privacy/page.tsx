import type { Metadata } from 'next';
import Prose from '@/components/Prose';
import { CONTACT_EMAIL } from '@/lib/site-contact';

export const metadata: Metadata = { title: 'Privacy Policy' };
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default function PrivacyPage() {
  return (
    <Prose title="Privacy Policy" updated="14 July 2026">
      <p>
        This policy explains what limited data we process and why. It is written to align with India's Digital
        Personal Data Protection Act, 2023 (DPDP). It is not legal advice.
      </p>

      <h2>We do not require an account</h2>
      <p>You can browse and rate representatives without signing up. We do not ask for your name, email or phone number to use the site.</p>

      <h2>Vote-integrity data (the only personal data we process)</h2>
      <p>
        To stop the same person voting many times without forcing you to log in, when you submit a rating we
        process - <strong>only to prevent duplicate voting</strong>:
      </p>
      <ul>
        <li>A <strong>coarsened, salted hash of your IP address</strong> (never your raw IP).</li>
        <li>A <strong>hashed device signal</strong> derived in your browser (never stored in raw form).</li>
        <li>A one-time Cloudflare Turnstile token to check you are human.</li>
      </ul>
      <p>
        We store only salted hashes, never the underlying IP or device details. The salt is rotated and the
        dedupe keys are retained only as long as needed for vote integrity. This data is never used for
        advertising, profiling, or any other purpose, and is not sold or shared.
      </p>

      <h2>Cookies</h2>
      <ul>
        <li>A <strong>language</strong> cookie remembering your chosen language. This is essential and carries no tracking.</li>
        <li>
          If advertising is enabled, Google AdSense may set <strong>third-party advertising cookies</strong>.
          These are only present when ads are shown. You can manage ad personalisation in your Google settings.
        </li>
      </ul>
      <p>We do not run behavioural analytics or tracking pixels by default.</p>

      <h2>Data about public figures</h2>
      <p>
        Information about representatives is compiled from public and official sources (Election Commission
        affidavits, Parliament records, Wikidata) with a citation for every fact. This is publicly available
        information about public office-holders, published for civic awareness.
      </p>

      <h2>Your rights</h2>
      <p>
        You may ask what dedupe data (if any) relates to you and request its erasure, and public figures may
        request corrections through our <a href="/grievance">grievance and right-to-reply process</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Data-protection queries: <strong>{CONTACT_EMAIL}</strong>. See also our{' '}
        <a href="/grievance">Grievance / Right to reply</a> page.
      </p>
    </Prose>
  );
}
