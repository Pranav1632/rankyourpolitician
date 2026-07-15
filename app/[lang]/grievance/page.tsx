import type { Metadata } from 'next';
import Prose from '@/components/Prose';
import GrievanceMailto from '@/components/GrievanceMailto';
import { CONTACT_EMAIL as EMAIL, GRIEVANCE_OFFICER_NAME } from '@/lib/site-contact';

export const metadata: Metadata = { title: 'Grievance / Right to Reply' };
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default function GrievancePage() {
  return (
    <Prose title="Grievance & Right to Reply" updated="14 July 2026">
      <p>
        We publish only sourced, factual information about public office-holders and we take accuracy seriously.
        This page is our grievance mechanism, aligned with India's Information Technology (Intermediary
        Guidelines) Rules, 2021.
      </p>

      <h2>Request a correction or right to reply</h2>
      <p>
        If you are a representative (or their office), or you have spotted an error, email us with the details
        and any supporting official source:
      </p>
      <p>
        <GrievanceMailto email={EMAIL} />
      </p>
      <p>Please include the specific fact, why it is wrong or out of date, and a link to an official source for the correct information.</p>

      <h2>How we handle grievances</h2>
      <ul>
        <li>We acknowledge every grievance within <strong>24 hours</strong>.</li>
        <li>We aim to resolve it within <strong>15 days</strong>.</li>
        <li>Where a fact is corrected, we update it and keep a record of the change.</li>
        <li>A right-to-reply statement can be published alongside the relevant profile.</li>
      </ul>

      <h2>Grievance Officer</h2>
      <p>
        In accordance with the IT Rules, 2021, grievances are handled by our Grievance Officer:
      </p>
      <ul>
        <li><strong>Name:</strong> {GRIEVANCE_OFFICER_NAME}</li>
        <li><strong>Email:</strong> {EMAIL}</li>
        <li><strong>Based in:</strong> India</li>
      </ul>
    </Prose>
  );
}
