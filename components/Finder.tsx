'use client';
// The responsibility finder: problem + YOUR district â†’ the actual people
// responsible, in escalation order. Location is remembered on this device and
// deep-linkable (?state=TG&district=Adilabad). People data comes from the
// prebuilt static /who/{ST}.json payloads â€” no server work per lookup.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { PROBLEMS, PROBLEM_META, PROBLEM_ROUTES, OFFICE_META, CPGRAMS_URL } from '@/lib/offices';
import { PROBLEM_CHAIN, ESCALATION_CHAINS } from '@/lib/escalation';
import type { WhoStateFile } from '@/lib/responsibility';
import type { ProblemType } from '@/lib/types';
import Icon from './Icon';
import EscalationChain from './EscalationChain';
import ResponsiblePeople from './ResponsiblePeople';

// ---- static payload loading (cached per state, shared across mounts) -------
const stateCache = new Map<string, Promise<WhoStateFile>>();
function loadState(code: string): Promise<WhoStateFile> {
  if (!stateCache.has(code)) {
    const p = fetch(`/who/${code}.json`).then((r) => {
      if (!r.ok) throw new Error(`who/${code}: HTTP ${r.status}`);
      return r.json() as Promise<WhoStateFile>;
    });
    p.catch(() => stateCache.delete(code));
    stateCache.set(code, p);
  }
  return stateCache.get(code)!;
}

let indexCache: Promise<[string, string][]> | null = null;
function loadIndex(): Promise<[string, string][]> {
  if (!indexCache) {
    indexCache = fetch('/who/index.json').then((r) => {
      if (!r.ok) throw new Error(`who/index: HTTP ${r.status}`);
      return r.json() as Promise<[string, string][]>;
    });
    indexCache.catch(() => (indexCache = null));
  }
  return indexCache;
}

const AREA_KEY = 'ryp:my-area';

export default function Finder() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const [problem, setProblem] = useState<ProblemType | null>(null);
  const [area, setArea] = useState<'urban' | 'rural'>('urban');
  const [states, setStates] = useState<[string, string][]>([]);
  const [stateCode, setStateCode] = useState('');
  const [stateFile, setStateFile] = useState<WhoStateFile | null>(null);
  const [district, setDistrict] = useState('');
  const [loadingState, setLoadingState] = useState(false);
  const initialised = useRef(false);

  // Initial location: URL params win, else the remembered area.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    loadIndex().then(setStates).catch(() => setStates([]));
    let st = params.get('state') || '';
    let d = params.get('district') || '';
    if (!st) {
      try {
        const saved = JSON.parse(localStorage.getItem(AREA_KEY) || 'null');
        if (saved?.stateCode) {
          st = saved.stateCode;
          d = saved.district || '';
        }
      } catch {
        /* ignore */
      }
    }
    const p = params.get('problem');
    if (p && (PROBLEMS as string[]).includes(p)) setProblem(p as ProblemType);
    if (st) selectState(st, d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectState = useCallback((code: string, presetDistrict = '') => {
    setStateCode(code);
    setStateFile(null);
    setDistrict('');
    if (!code) return;
    setLoadingState(true);
    loadState(code)
      .then((f) => {
        setStateFile(f);
        if (presetDistrict && f.districts[presetDistrict]) setDistrict(presetDistrict);
        else {
          // case-insensitive match for URL-provided names
          const hit = Object.keys(f.districts).find((k) => k.toLowerCase() === presetDistrict.toLowerCase());
          if (hit) setDistrict(hit);
        }
      })
      .catch(() => setStateFile(null))
      .finally(() => setLoadingState(false));
  }, []);

  // Persist + reflect the selection in the URL (shareable).
  useEffect(() => {
    if (!initialised.current) return;
    try {
      if (stateCode) localStorage.setItem(AREA_KEY, JSON.stringify({ stateCode, district }));
    } catch {
      /* ignore */
    }
    const q = new URLSearchParams();
    if (problem) q.set('problem', problem);
    if (stateCode) q.set('state', stateCode);
    if (district) q.set('district', district);
    router.replace(q.toString() ? `/who?${q.toString()}` : '/who', { scroll: false });
  }, [problem, stateCode, district, router]);

  const offices = problem ? PROBLEM_ROUTES[problem][area] : [];
  const districtNames = useMemo(() => (stateFile ? Object.keys(stateFile.districts) : []), [stateFile]);
  const people = stateFile && district ? stateFile.districts[district] : null;

  return (
    <div>
      {/* Step 1: problem grid */}
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">{t('finder.pickProblem')}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {PROBLEMS.map((p) => {
          const active = problem === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setProblem(p)}
              aria-pressed={active}
              className={`pressable flex items-center gap-2.5 rounded-2xl border p-3 text-left transition ${
                active ? 'border-brand bg-brand-soft text-brand-ink shadow-soft' : 'border-line bg-white/90 text-ink-soft hover:border-brand/40'
              }`}
            >
              <span className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-brand text-white' : 'bg-paper-sink text-ink-faint'}`}>
                <Icon name={PROBLEM_META[p].icon} size={18} />
              </span>
              <span className="text-sm font-semibold leading-tight">{t(`problems.${p}`)}</span>
            </button>
          );
        })}
      </div>

      {/* Step 2: where are you? */}
      <div className="mt-5 rounded-3xl glass p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Icon name="pin" size={15} /> {t('who.locate')}
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">{t('who.locateHelp')}</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor="who-state" className="sr-only">{t('who.pickState')}</label>
            <select
              id="who-state"
              value={stateCode}
              onChange={(e) => selectState(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">{t('who.pickStateFirst')}</option>
              {states.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="who-district" className="sr-only">{t('who.pickDistrict')}</label>
            <select
              id="who-district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              disabled={!stateFile || loadingState}
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-50"
            >
              <option value="">{loadingState ? t('common.loading') : t('who.pickDistrictFirst')}</option>
              {districtNames.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 3: area type */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">{t('finder.areaType')}</span>
          <div className="inline-flex rounded-full bg-paper-sink p-1 text-sm font-semibold">
            {(['urban', 'rural'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setArea(a)}
                className={`rounded-full px-4 py-1.5 ${area === a ? 'bg-white text-brand shadow-sm' : 'text-ink-faint'}`}
              >
                {t(`finder.${a}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6">
        {!problem ? (
          <div className="rounded-3xl border border-dashed border-line bg-white/80 p-8 text-center text-ink-faint">
            {t('finder.chooseAbove')}
          </div>
        ) : (
          <div className="rounded-3xl glass p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-grid h-9 w-9 place-items-center rounded-xl bg-brand text-white">
                <Icon name={PROBLEM_META[problem].icon} size={18} />
              </span>
              <h2 className="text-lg font-bold text-ink">
                {t(`problems.${problem}`)}
                {district && <span className="text-ink-faint"> Â· {district}</span>}
              </h2>
            </div>

            {people && stateFile ? (
              // The real-people ladder for the chosen district.
              <div className="mt-4">
                <ResponsiblePeople
                  problem={problem}
                  area={area}
                  stateCode={stateFile.stateCode}
                  state={stateFile.state}
                  asOf={stateFile.asOf}
                  cm={stateFile.cm}
                  ministers={stateFile.ministers}
                  district={district}
                  people={people}
                />
              </div>
            ) : loadingState ? (
              <div className="mt-4 space-y-2" aria-hidden="true">
                <div className="skeleton h-16 w-full" />
                <div className="skeleton h-16 w-11/12" />
              </div>
            ) : (
              // No district picked yet â€” role-level guidance + a nudge.
              <>
                <p className="mt-3 flex items-center gap-2 rounded-2xl bg-accent-soft p-3 text-sm font-semibold text-accent-ink">
                  <Icon name="pin" size={16} /> {t('who.pickForPeople')}
                </p>
                <ol className="mt-3 space-y-3">
                  {offices.map((o, i) => (
                    <li key={o} className="rounded-2xl border border-line/70 bg-white/85 p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-bold text-ink">
                            <Icon name={OFFICE_META[o].icon} size={16} className="text-brand" />
                            {t(`offices.${o}.label`)}
                          </p>
                          <p className="mt-1 text-sm text-ink-soft">{t(`offices.${o}.handles`)}</p>
                          <p className="mt-2 text-xs">
                            <span className="font-semibold text-ink-faint">{t('finder.escalateLabel')}: </span>
                            <span className="text-ink-soft">{t(`offices.${o}.escalate`)}</span>
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {/* Full role-based reporting chain (verified) â€” collapsed reference */}
            <details className="group mt-5 rounded-2xl border border-line/70 bg-white/80">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-brand">
                <span className="flex items-center gap-1.5"><Icon name="layers" size={15} /> {t('finder.escalationTitle')}</span>
                <Icon name="chevron" size={16} className="transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-line/70 p-4">
                <EscalationChain
                  chain={ESCALATION_CHAINS[PROBLEM_CHAIN[problem][area]]}
                  labels={{
                    startHere: t('escalation.startHere'),
                    escalate: t('escalation.escalate'),
                    covers: t('escalation.covers'),
                    thisOffice: t('escalation.thisOffice'),
                    varies: t('escalation.varies'),
                    sources: t('escalation.sources'),
                  }}
                />
              </div>
            </details>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line/70 pt-4">
              <a href={CPGRAMS_URL} target="_blank" rel="noopener noreferrer" className="pressable inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink">
                <Icon name="megaphone" size={15} /> {t('finder.complainCta')}
              </a>
              {district && (
                <Link
                  href={`/district/${stateCode}/${encodeURIComponent(district)}`}
                  className="pressable inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand"
                >
                  <Icon name="map" size={15} /> {t('who.openDistrict', { district })}
                </Link>
              )}
            </div>
            <p className="mt-3 text-sm text-ink-faint">
              <Icon name="info" size={14} className="mr-1 inline" />
              {area === 'urban' ? t('finder.parallelCouncillor') : t('finder.parallelPanchayat')}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/accountability" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          <Icon name="info" size={15} /> {t('finder.learnTiers')}
        </Link>
        <p className="text-xs text-ink-faint">{t('finder.disclaimer')}</p>
      </div>
    </div>
  );
}
