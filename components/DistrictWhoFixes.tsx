'use client';
// "Who fixes what here" - embedded on every district page. Pick a problem,
// see the actual responsible people for THIS district immediately (data comes
// server-side as props; no fetch). Deep-links into /who for the full finder.
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { PROBLEMS, PROBLEM_META } from '@/lib/offices';
import type { WhoPerson, WhoDistrict } from '@/lib/responsibility';
import type { ContactChannel, ProblemType } from '@/lib/types';
import ResponsiblePeople from './ResponsiblePeople';
import Icon from './Icon';

export default function DistrictWhoFixes({
  stateCode,
  state,
  asOf,
  cm,
  ministers,
  district,
  people,
  channels,
}: {
  stateCode: string;
  state: string;
  asOf?: string;
  cm?: WhoPerson;
  ministers: WhoPerson[];
  district: string;
  people: WhoDistrict;
  channels?: ContactChannel[];
}) {
  const { t } = useI18n();
  const [problem, setProblem] = useState<ProblemType>('roads');
  const [area, setArea] = useState<'urban' | 'rural'>('urban');

  return (
    <div>
      {/* Problem chips */}
      <div className="flex flex-wrap gap-1.5">
        {PROBLEMS.map((p) => {
          const active = problem === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setProblem(p)}
              aria-pressed={active}
              className={`pressable inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active ? 'border-brand bg-brand text-white shadow-soft' : 'border-line bg-white/90 text-ink-soft hover:border-brand/40'
              }`}
            >
              <Icon name={PROBLEM_META[p].icon} size={13} />
              {t(`problems.${p}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="inline-flex rounded-full bg-paper-sink p-1 text-xs font-semibold">
          {(['urban', 'rural'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`rounded-full px-3 py-1 ${area === a ? 'bg-white text-brand shadow-sm' : 'text-ink-faint'}`}
            >
              {t(`finder.${a}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <ResponsiblePeople
          problem={problem}
          area={area}
          stateCode={stateCode}
          state={state}
          asOf={asOf}
          cm={cm}
          ministers={ministers}
          district={district}
          people={people}
          channels={channels}
          compact
        />
      </div>

      <Link
        href={`/who?state=${stateCode}&district=${encodeURIComponent(district)}&problem=${problem}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        <Icon name="megaphone" size={15} /> {t('district.whoCta')}
      </Link>
    </div>
  );
}
