import type { Metadata } from 'next';
import Prose from '@/components/Prose';

export const metadata: Metadata = { title: 'Terms of Use' };
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default function TermsPage() {
  return (
    <Prose title="Terms of Use" updated="14 July 2026">
      <p>By using this site you agree to these terms. The site is provided for civic awareness and is not legal advice.</p>

      <h2>Purpose and neutrality</h2>
      <p>
        RankYourPolitician is independent and non-partisan. It is not affiliated with any political party,
        candidate, or government body. We present sourced facts and clearly-labelled measures; we do not
        endorse or oppose any person or party.
      </p>

      <h2>Accuracy and corrections</h2>
      <p>
        We compile information from public and official sources and cite each fact, but data can contain errors
        or become out of date. If you believe something is inaccurate, please use our{' '}
        <a href="/grievance">right-to-reply and correction process</a>.
      </p>

      <h2>User ratings</h2>
      <p>When you submit a rating you agree that:</p>
      <ul>
        <li>Ratings reflect personal opinion and are shown separately from verified facts.</li>
        <li>You will not attempt to manipulate results through automated or coordinated voting.</li>
        <li>We may filter, down-weight, or remove ratings that show signs of manipulation, to protect integrity.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        You may not use the site to harass any individual, to post unlawful or defamatory content, or to scrape
        it in violation of these terms. Any comment or contribution facilities are moderated.
      </p>

      <h2>Intellectual property and sources</h2>
      <p>
        Underlying facts belong to their official sources and are cited accordingly. Our own compiled scores and
        code are intended to be open source under a permissive licence.
      </p>

      <h2>Liability</h2>
      <p>The site is provided "as is", without warranties. To the extent permitted by law, we are not liable for decisions taken on the basis of the information provided.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India.</p>
    </Prose>
  );
}
