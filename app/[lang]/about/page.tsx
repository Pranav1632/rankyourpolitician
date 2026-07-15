import type { Metadata } from 'next';
import Link from 'next/link';
import Prose from '@/components/Prose';

export const metadata: Metadata = { title: 'About' };
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default function AboutPage() {
  return (
    <Prose title="About RankYourPolitician">
      <p>
        RankYourPolitician is a free, non-partisan, public-welfare project that helps people in India know who
        represents their area, understand what each office is responsible for, and see how representatives are
        performing - all backed by cited, official sources.
      </p>

      <h2>Why this exists</h2>
      <p>
        Accountability starts with information. Many citizens don't know which office owns which problem - an MP,
        an MLA, or the local municipality. We make that clear, and we put verifiable facts and a transparent
        performance measure in one searchable place.
      </p>

      <h2>Our principles</h2>
      <ul>
        <li><strong>Non-partisan.</strong> Identical treatment for every representative, regardless of party. No party leaderboards.</li>
        <li><strong>Factual and sourced.</strong> Every claim links to an official source with a date. No citation, no claim.</li>
        <li><strong>Transparent.</strong> Our <Link href="/methodology">methodology</Link> is public and the project is open source.</li>
        <li><strong>Two separate measures.</strong> Verified performance is never mixed with public opinion.</li>
        <li><strong>A right to reply.</strong> Public figures can request <Link href="/grievance">corrections</Link>.</li>
      </ul>

      <h2>Coverage</h2>
      <p>
        We are starting with Lok Sabha Members of Parliament and expanding across states and, over time, to state
        assembly and local representatives. Facts are re-checked periodically and each entry shows its own
        "last updated" date.
      </p>

      <h2>Get involved</h2>
      <p>
        The project is intended to be open source and community-supported. If you'd like to help with data,
        translations, or code, get in touch via the <Link href="/grievance">contact page</Link>.
      </p>
    </Prose>
  );
}
