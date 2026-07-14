'use client';
// "Find your state's government" â€” a personalised slice of the org chart.
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Avatar, PartyChip, Chip } from './ui';
import Icon from './Icon';

export interface CmSummary {
  stateCode: string;
  state: string;
  cmName?: string;
  cmParty?: string;
  cmId?: string;
  cmPhoto?: string;
  governor?: string;
  mlas: number;
  presidentsRule?: boolean;
}

export default function StateCMPicker({ states }: { states: CmSummary[] }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const sel = states.find((s) => s.stateCode === code) || null;

  return (
    <div>
      <label htmlFor="cm-picker" className="text-sm font-semibold text-ink-soft">
        {t('hierarchyPage.pickState')}
      </label>
      <select
        id="cm-picker"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
      >
        <option value="">{t('hierarchyPage.pickStatePlaceholder')}</option>
        {states.map((s) => (
          <option key={s.stateCode} value={s.stateCode}>
            {s.state}
          </option>
        ))}
      </select>

      {sel && (
        <div className="mt-3 animate-scale-in rounded-2xl border border-brand/20 bg-white/90 p-4">
          {sel.presidentsRule ? (
            <p className="text-sm text-ink-soft">{t('stateGov.presidentsRule')}</p>
          ) : sel.cmName ? (
            <Link href={sel.cmId ? `/person/${sel.cmId}` : `/state/${sel.stateCode}`} className="flex items-center gap-3">
              <Avatar name={sel.cmName} src={sel.cmPhoto} size={52} />
              <span className="min-w-0">
                <Chip tone="brand">{t('stateGov.cm')}</Chip>
                <span className="mt-1 block truncate font-bold text-ink">{sel.cmName}</span>
                {sel.cmParty && <PartyChip party={sel.cmParty} />}
              </span>
              <Icon name="chevron" size={16} className="ml-auto -rotate-90 shrink-0 text-ink-faint" />
            </Link>
          ) : (
            <p className="text-sm text-ink-faint">{t('stateGov.beingVerified')}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/70 pt-3 text-xs text-ink-soft">
            {sel.governor && (
              <span>
                <span className="font-semibold">{t('stateGov.governor')}:</span> {sel.governor}
              </span>
            )}
            <span>
              <span className="font-semibold tabular-nums">{sel.mlas}</span> {t('hierarchyPage.mlasInAssembly')}
            </span>
          </div>
          <Link
            href={`/state/${sel.stateCode}`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            {t('hierarchyPage.openStatePage', { state: sel.state })} <Icon name="arrow" size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
