import type { Metadata } from 'next';
import Link from 'next/link';
import Prose from '@/components/Prose';

export const metadata: Metadata = {
  title: 'Methodology',
  description: 'How RankYourPolitician sources data and computes its two independent ranking axes.',
  alternates: { canonical: '/methodology' },
};
export { allLocaleStaticParams as generateStaticParams } from '@/lib/i18n/server';

export default function MethodologyPage() {
  return (
    <Prose title="Methodology" updated="17 July 2026">
      <p>
        This site is an information tool, not a verdict. We publish sourced facts and two separate,
        clearly-labelled measures. We never combine them into a single score, and we never editorialise.
      </p>

      <h2>Two independent axes</h2>
      <p>
        Every representative is shown on two axes that are stored and computed separately, so that public
        opinion can never move the factual measure:
      </p>
      <ul>
        <li>
          <strong>Verified Performance</strong> - built <em>only</em> from official, government-sourced data.
        </li>
        <li>
          <strong>Public Sentiment</strong> - open public ratings. This is opinion, explicitly labelled
          "not verified".
        </li>
      </ul>

      <h2>Verified Performance (formula v2)</h2>
      <p>
        For Members of Parliament we use official parliamentary metrics: attendance, questions asked, debates
        participated in, private member bills, and constituency-fund (MPLADS) utilisation. Each metric is
        converted to a <strong>percentile within a comparable cohort</strong> - the same house and tenure
        bracket - and combined as a <strong>weighted average</strong> with fixed, public weights:
        attendance 35%, questions 25%, debates 20%, private member bills 10%, MPLADS 10%
        (weights are re-normalised over the metrics that are actually verified for a member).
        Attendance carries the most weight because it is the most universal duty; questions and debates
        measure active scrutiny of the government; bills and fund utilisation reward initiative but have
        patchier official coverage - in practice they are usually not scored at all (see "sparse metrics").
      </p>
      <ul>
        <li>
          <strong>One source per metric:</strong> every attendance, questions and debates figure comes from
          the official Digital Sansad record and nowhere else. Aggregators measure over different windows,
          so mixing them would rank members against numbers that were never counted the same way. We re-derive
          every figure from the official API and compare it against what we publish; anything that does not
          match is corrected or removed rather than shown.
        </li>
        <li>
          <strong>Data floor:</strong> a member needs at least <strong>two</strong> verified metrics to be
          ranked (one for ministers, who are exempt from the attendance register and from questions - see
          "exemptions" below). Below the floor we say "not enough data" - we never rank on a single number,
          and an alphabetical list is never presented as a ranking.
        </li>
        <li>
          <strong>Sparse metrics are never scored:</strong> a percentile only means something when enough
          peers are measured the same way, so a metric must be available for at least 10 members of a cohort
          before it can affect anyone’s score. A number that only a handful of members happen to have is
          shown as a plain fact, never converted into a standing or a rank.
        </li>
        <li>
          <strong>How attendance is counted:</strong> the Lok Sabha register marks each sitting day
          "signed", "not signed" or <strong>"NR" (no record)</strong>. Attendance is signed days divided by
          <em> recorded</em> days only, and we require at least 20 recorded days before stating a percentage.
          "NR" days are excluded entirely: they are how the house marks members it keeps no register for.
          The Rajya Sabha record works the same way, with the marker "M" for ministers.
        </li>
        <li>
          <strong>Exemptions are not zeros:</strong> members of the Council of Ministers do not sign the
          attendance register and answer questions rather than table them; presiding officers (the Speaker,
          the Deputy Chairperson) run the house rather than participate in it; the house also keeps no
          register record for the Leader of the Opposition, who holds Cabinet rank. For these members the
          affected metrics are shown as <em>"exempt"</em> with the reason, are excluded from their score and
          from the cohort distribution, and are never displayed or counted as 0.
        </li>
        <li>State legislatures do not publish comparable member-level attendance/questions data, so MLAs/MLCs show these fields as "not published" and appear as "not enough data" rather than being given a made-up score.</li>
        <li>Declared assets and criminal cases are shown as neutral factual context and are <strong>not</strong> scored.</li>
        <li>Where data is missing, we show "unavailable" - never a zero.</li>
        <li>Scores are displayed as "top X%" of the comparable cohort (e.g. percentile 87 → top 13%).</li>
      </ul>

      <h2>Declared court cases</h2>
      <p>
        Criminal cases are shown exactly as each leader declared them in their own sworn election
        affidavit (Form 26 filed with the Election Commission), as published by MyNeta / the Association
        for Democratic Reforms. We reproduce the affidavit&apos;s case list verbatim - FIR and case numbers,
        courts, sections, whether charges have been framed, and any convictions with the punishment and
        appeal status the leader declared. <strong>A pending case is an accusation before a court, not a
        conviction</strong>, and we say so wherever cases appear. Cases are never scored and never affect
        either ranking axis.
      </p>
      <p>
        <strong>What gets highlighted as "serious":</strong> a charge is highlighted purely because its
        statute section is on a fixed public list, drawn from the offence groups of the Indian Penal Code
        and the Bharatiya Nyaya Sanhita themselves: offences affecting life (e.g. IPC 302/304/307, BNS
        103/105/109), sexual offences and offences against women (IPC 354/376/498A, BNS 64-79/85),
        kidnapping and abduction (IPC 363-369, BNS 137-140), extortion, robbery and dacoity (IPC 383-402,
        BNS 308-312), promoting enmity (IPC 153A/295A, BNS 196/299), counterfeiting currency, and charges
        under named special statutes (Prevention of Corruption Act, PMLA, UAPA, NDPS Act, Arms Act, POCSO,
        SC/ST (Prevention of Atrocities) Act, Explosive Substances Act). The highlight describes the
        <em> charge</em>, never the person; a section not on the list is simply shown without a highlight.
      </p>

      <h2>Public Sentiment</h2>
      <p>
        Ratings (1-5) are collected without login. <strong>The score we show is the plain average of the votes
        actually cast</strong> - if five people rate someone 1, it reads 1.0. Alongside it we always show the
        full distribution, the vote count and a confidence indicator, so a thin sample is visible as a thin
        sample rather than being quietly adjusted.
      </p>
      <p>
        <strong>Ordering</strong> is a different question from <em>reporting</em>. When you sort by rating we
        rank on a <strong>Bayesian-shrunk</strong> score - one that stays near the neutral mean until enough
        independent votes accumulate - because otherwise a single 5-star vote would top the table. That shrunk
        number is used only to decide order; we never print it as someone’s rating, because it is not a number
        anyone voted for.
      </p>
      <p>
        Vote integrity is layered: a Cloudflare Turnstile human-check, a soft device signal, and rate limiting
        on a hashed, coarsened IP, with one updatable vote per person. No login-less system is perfect; a
        determined attacker can still get through, which is exactly why sentiment is kept separate from the
        verified measure and labelled as opinion.
      </p>

      <h2>Sources</h2>
      <p>
        "No citation, no claim." Identity and cross-references come from Wikidata; declared assets, education
        and criminal cases from Election Commission affidavits; parliamentary activity exclusively from the
        official Digital Sansad record. Every fact links to its source and shows the date it was retrieved.
      </p>

      <h2>Corrections</h2>
      <p>
        We offer a <Link href="/grievance">right to reply and a correction process</Link>. If a fact is wrong or
        out of date, tell us and we will review it. Our code and data are intended to be open source.
      </p>
    </Prose>
  );
}
