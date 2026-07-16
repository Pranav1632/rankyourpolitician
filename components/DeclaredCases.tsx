// Declared court cases - the case-by-case affidavit record behind the
// "Declared court cases" count tile. Server component only (it receives the
// server-side `tr` closure); everything renders statically, collapse/expand
// is native <details> so the section ships zero client JS.
//
// NEUTRALITY: every value is shown verbatim from the member's own sworn
// affidavit as published by the cited source. Pending cases are accusations,
// and the section says so; the "serious" highlight is a fixed statute-section
// list (lib/criminal-severity.ts) documented on the methodology page - it
// describes the charge, never the person.
import type { CriminalRecord, CriminalCase, CriminalCharge, Fact } from '@/lib/types';
import { chargeCategory, caseIsSerious, seriousSectionsInText, seriousActsInText } from '@/lib/criminal-severity';
import { formatDate } from '@/lib/format';
import Icon from '@/components/Icon';
import { Chip } from '@/components/ui';

type Tr = (k: string, v?: Record<string, string | number>) => string;

const CHARGES_VISIBLE = 6;
const CASES_VISIBLE = 5;

function SourceFooter({ url, name, retrieved, asOf, tr, locale }: { url: string; name: string; retrieved: string; asOf?: string; tr: Tr; locale: string }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-xs text-ink-faint">
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">
        <Icon name="link" size={12} /> {tr('common.source')}: {name}
      </a>
      <span>· {tr('common.lastUpdated')} {formatDate(retrieved, locale)}</span>
      {asOf && <span>· {tr('common.asOf')} {asOf}</span>}
    </p>
  );
}

function CaseCard({ c, tr }: { c: CriminalCase; tr: Tr }) {
  const serious = caseIsSerious(c);
  const convicted = c.status === 'convicted';
  const seriousSecs = seriousSectionsInText(c.law, c.sections);
  const seriousActs = seriousActsInText(c.other_sections);
  const rows: [string, string | undefined][] = [
    [tr('profile.cases.court'), c.court],
    [tr('profile.cases.firNo'), c.fir_no],
    [tr('profile.cases.caseNo'), c.case_no],
    [tr('profile.cases.sections'), c.sections ? `${c.law ? `${c.law} ` : ''}${c.sections}` : undefined],
    [tr('profile.cases.otherActs'), c.other_sections],
    ...(convicted
      ? ([
          [tr('profile.cases.punishment'), c.punishment],
          [tr('profile.cases.convictedOn'), c.convicted_date],
        ] as [string, string | undefined][])
      : ([
          [
            tr('profile.cases.chargesFramed'),
            c.charges_framed ? `${c.charges_framed}${c.framed_date ? ` (${c.framed_date})` : ''}` : undefined,
          ],
        ] as [string, string | undefined][])),
    [tr('profile.cases.appeal'), c.appeal_filed ? `${c.appeal_filed}${c.appeal_details ? ` - ${c.appeal_details}` : ''}` : undefined],
  ];
  return (
    <li
      className={`rounded-xl border-l-4 bg-paper-soft p-3.5 ${
        convicted ? 'border-red-600' : serious ? 'border-amber-500' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {convicted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
            <Icon name="law" size={13} /> {tr('profile.cases.statusConvicted')}
          </span>
        ) : c.status === 'pending' ? (
          <Chip tone="neutral">{tr('profile.cases.statusPending')}</Chip>
        ) : (
          <Chip tone="neutral">{c.status_label}</Chip>
        )}
        {seriousSecs.map((s) => (
          <span key={s.section} className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {c.law} {s.section} · {tr(`profile.cases.cat.${s.category}`)}
          </span>
        ))}
        {seriousActs.map((a) => (
          <span key={a} className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {a}
          </span>
        ))}
      </div>
      <dl className="mt-2.5 space-y-1">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:gap-2">
              <dt className="shrink-0 font-semibold text-ink-faint sm:w-36">{label}</dt>
              <dd className="text-ink-soft">{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
    </li>
  );
}

export default function DeclaredCases({
  record,
  fact,
  tr,
  locale,
}: {
  record?: CriminalRecord;
  fact?: Fact;
  tr: Tr;
  locale: string;
}) {
  // No affidavit count at all -> the profile has nothing citable to show and
  // the Record section already prints "unavailable"; render nothing.
  if (!fact) return null;
  const declared = record?.declared_total ?? parseInt(fact.value, 10);

  return (
    <section id="court-cases" className="mt-5 glass rounded-3xl p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
        <span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-paper-sink text-ink-soft"><Icon name="scales" size={18} /></span>
        {tr('profile.cases.title')}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{tr('profile.cases.subtitle', { asOf: record?.as_of ?? fact.as_of ?? '' })}</p>

      {declared === 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-perf-soft/60 p-3.5 text-sm text-ink">
          <Icon name="check" size={17} className="mt-0.5 shrink-0 text-perf" />
          {tr('profile.cases.none')}
        </p>
      ) : !record ? (
        <>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-paper-soft p-3.5 text-sm text-ink-soft">
            <Icon name="info" size={17} className="mt-0.5 shrink-0 text-ink-faint" />
            {tr('profile.cases.detailUnavailable', { n: declared })}
          </p>
        </>
      ) : (
        <DeclaredCasesBody record={record} tr={tr} />
      )}

      {declared > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
          <Icon name="info" size={15} className="mt-0.5 shrink-0 text-amber-800" />
          {tr('profile.cases.disclaimer')}
        </p>
      )}
      <SourceFooter
        url={record?.source_url ?? fact.source_url}
        name={record?.source_name ?? fact.source_name}
        retrieved={record?.retrieved_date ?? fact.retrieved_date}
        asOf={record?.as_of ?? fact.as_of}
        tr={tr}
        locale={locale}
      />
    </section>
  );
}

function DeclaredCasesBody({ record, tr }: { record: CriminalRecord; tr: Tr }) {
  // Serious charge types first (they are what the reader must not miss),
  // then by declared frequency; ties keep the affidavit's own order.
  const charges = [...record.charges].sort((a, b) => {
    const sa = chargeCategory(a) ? 1 : 0;
    const sb = chargeCategory(b) ? 1 : 0;
    return sb - sa || b.count - a.count;
  });
  const seriousChargeCount = record.charges.filter((c) => chargeCategory(c)).reduce((s, c) => s + c.count, 0);

  // Convictions first - a declared conviction outranks any accusation - then
  // pending cases with highlighted sections, then the rest.
  const cases = [...record.cases].sort((a, b) => {
    const rank = (c: CriminalCase) => (c.status === 'convicted' ? 0 : caseIsSerious(c) ? 1 : 2);
    return rank(a) - rank(b);
  });
  const convicted = record.cases.filter((c) => c.status === 'convicted').length;

  return (
    <>
      {/* Glance figures - all self-declared, all from the one cited page. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-sink px-3 py-1.5 text-sm font-bold text-ink">
          {tr('profile.cases.declaredCount', { n: record.declared_total })}
        </span>
        {convicted > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700">
            <Icon name="law" size={15} /> {tr('profile.cases.convictedCount', { n: convicted })}
          </span>
        )}
        {seriousChargeCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800">
            <Icon name="warn" size={15} /> {tr('profile.cases.seriousCount', { n: seriousChargeCount })}
          </span>
        )}
      </div>

      {/* Charge summary - what the charges are, by statute section. */}
      {charges.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('profile.cases.chargesTitle')}</h3>
          <ul className="space-y-1.5">
            {charges.slice(0, CHARGES_VISIBLE).map((c, i) => (
              <ChargeRow key={i} c={c} tr={tr} />
            ))}
          </ul>
          {charges.length > CHARGES_VISIBLE && (
            <details className="group mt-1.5">
              <summary className="flex cursor-pointer items-center gap-1 py-1 text-sm font-semibold text-brand">
                <Icon name="chevron" size={15} className="transition group-open:rotate-180" />
                {tr('profile.cases.showAllCharges', { n: charges.length })}
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {charges.slice(CHARGES_VISIBLE).map((c, i) => (
                  <ChargeRow key={i} c={c} tr={tr} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Case-by-case detail, verbatim from the affidavit. */}
      {record.cases.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{tr('profile.cases.caseListTitle')}</h3>
          <ul className="space-y-2.5">
            {cases.slice(0, CASES_VISIBLE).map((c, i) => (
              <CaseCard key={i} c={c} tr={tr} />
            ))}
          </ul>
          {cases.length > CASES_VISIBLE && (
            <details className="group mt-2">
              <summary className="flex cursor-pointer items-center gap-1 py-1 text-sm font-semibold text-brand">
                <Icon name="chevron" size={15} className="transition group-open:rotate-180" />
                {tr('profile.cases.showAllCases', { n: cases.length })}
              </summary>
              <ul className="mt-2 space-y-2.5">
                {cases.slice(CASES_VISIBLE).map((c, i) => (
                  <CaseCard key={i} c={c} tr={tr} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* The page's own count and its case table can disagree (unreadable
          affidavit scans); say so instead of papering over it. */}
      {record.cases.length !== record.declared_total && (
        <p className="mt-3 text-xs text-ink-faint">
          {tr('profile.cases.countMismatch', { declared: record.declared_total, listed: record.cases.length })}
        </p>
      )}
    </>
  );
}

function ChargeRow({ c, tr }: { c: CriminalCharge; tr: Tr }) {
  const cat = chargeCategory(c);
  // Highlighted rows keep a FIXED light-amber background in both themes, so
  // every colour on them must be a fixed dark amber too - the theme-aware ink
  // tokens flip light in dark mode and would wash out against it.
  return (
    <li className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3.5 py-2 text-sm ${cat ? 'bg-amber-50' : 'bg-paper-soft'}`}>
      <span className={`inline-grid min-w-6 place-items-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${cat ? 'bg-amber-100 text-amber-900' : 'bg-paper-sink text-ink'}`}>
        {c.count}×
      </span>
      <span className={`min-w-0 flex-1 ${cat ? 'text-amber-950' : 'text-ink-soft'}`}>{c.description}</span>
      {c.section && (
        <span className={`text-xs font-semibold ${cat ? 'text-amber-800' : 'text-ink-faint'}`}>
          {c.law} {c.section}
        </span>
      )}
      {cat && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
          <Icon name="warn" size={12} /> {tr(`profile.cases.cat.${cat}`)}
        </span>
      )}
    </li>
  );
}
