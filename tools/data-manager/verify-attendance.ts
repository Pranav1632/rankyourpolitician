/**
 * Data-manager step: INDEPENDENT VERIFICATION of every stored attendance figure
 * (and the questions/debates counts alongside it) against the OFFICIAL Digital
 * Sansad APIs.
 *
 * `enrich-performance` WRITES metrics. This step re-derives them from scratch and
 * COMPARES, so a silent regression (API shape change, bad join, stale carry-over,
 * a value imported from a different source) surfaces as a diff instead of sitting
 * in the seed looking authoritative. Attendance drives the public ranking, so the
 * cost of a wrong number is a defamatory-by-implication claim about a real person.
 *
 * What it checks, per MP with a stored attendance_pct:
 *   1. SOURCE PURITY  - the cited source must be Digital Sansad. The ranking is a
 *      percentile cohort: a value from another aggregator (e.g. PRS MPTrack) is
 *      measured over a different window with a different denominator, so ranking
 *      it against Sansad-derived peers compares apples to oranges. Reported as
 *      `source-mix` and (with --fix) re-fetched from Sansad or dropped.
 *   2. ARITHMETIC     - the "N of D sitting days" in the cited fact must actually
 *      equal the stored percentage.
 *   3. LIVE VALUE     - re-fetch from Sansad and compare. Attendance/questions/
 *      debates only grow between sessions, so a stored value ABOVE live is a red
 *      flag (`stale-high`), while below-live is normal drift (`drift`).
 *   4. COHERENCE      - denominators must match the house's modal sitting-day
 *      count unless the member joined late (by-election), which is legitimate and
 *      reported as `short-tenure` rather than an error.
 *
 * Usage:  npm run dm -- verify-attendance            (report only; exit 1 on errors)
 *         npm run dm -- verify-attendance --fix      (rewrite seed from live Sansad)
 *         ATT_LIMIT=20 npm run dm -- verify-attendance
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);
const FIX = process.argv.includes('--fix');
const LIMIT = process.env.ATT_LIMIT ? parseInt(process.env.ATT_LIMIT, 10) : Infinity;
const RS_BEARER = 'Y0hKaFltaGhkQzVyYVhKaGJn';
// Tolerance for a live-vs-stored percentage-point gap before we call it drift.
const DRIFT_PP = 0.15;

async function getJson(u: string, headers: Record<string, string> = {}): Promise<any | null> {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
      if (r.ok) return await r.json();
      if (r.status === 400 || r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 700 * (a + 1)));
  }
  return null;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bnct of\b/g, '').replace(/\((?:sc|st)\)/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const tokens = (s: string) =>
  new Set((s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(dr|adv|shri|smt|kumari|prof|er|md|mohd|col)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 1));
function nameOverlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let i = 0; for (const t of ta) if (tb.has(t)) i++;
  return i / Math.min(ta.size, tb.size);
}

type Sev = 'error' | 'warn' | 'info';
interface Issue { sev: Sev; kind: string; id: string; name: string; detail: string }
const issues: Issue[] = [];
const add = (sev: Sev, kind: string, p: Politician, detail: string) =>
  issues.push({ sev, kind, id: p.id, name: p.name, detail });

const isSansad = (f?: Fact) => !!f && /Digital Sansad/i.test(f.source_name || '');
const attFact = (p: Politician) => p.facts.find((f) => f.field_type === 'attendance_pct');
const PERF_FIELDS = new Set(['attendance_pct', 'questions_asked', 'debates_participated']);

/** Strip every performance metric + its cited facts (used when we cannot verify). */
function dropPerf(p: Politician) {
  for (const f of PERF_FIELDS) delete (p.metrics as Record<string, number | undefined>)[f];
  p.facts = p.facts.filter((f) => !PERF_FIELDS.has(f.field_type));
}

const lsCite = (path: string, field: string, value: string): Fact => ({
  field_type: field,
  value,
  source_url: `https://sansad.in${path}`,
  source_name: 'Digital Sansad - Lok Sabha (official)',
  retrieved_date: TODAY,
  as_of: '18th Lok Sabha, all sessions to date',
} as Fact);

/**
 * Overwrite an LS member's performance metrics + cited facts with the values we
 * just re-derived from the live API. Old perf facts are dropped first so a stale
 * citation can never outlive the number it justified.
 */
function applyLs(
  p: Politician,
  pct: number,
  signed: number,
  eligible: number,
  questions: number | null,
  debates: number | null,
) {
  p.facts = p.facts.filter((f) => !PERF_FIELDS.has(f.field_type));
  p.metrics.attendance_pct = pct;
  p.facts.push(lsCite('/ls/members', 'attendance_pct', `${pct}% (${signed} of ${eligible} sitting days signed)`));
  if (typeof questions === 'number') {
    p.metrics.questions_asked = questions;
    p.facts.push(lsCite('/ls/questions/questions-and-answers', 'questions_asked', String(questions)));
  }
  if (typeof debates === 'number') {
    p.metrics.debates_participated = debates;
    p.facts.push(lsCite('/ls/debates', 'debates_participated', String(debates)));
  }
}

async function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  const stored = pols.filter((p) => p.metrics && p.metrics.attendance_pct !== undefined);
  console.log(`Verifying ${stored.length} stored attendance figures against sansad.in…\n`);

  // ---------- 1. Source purity + arithmetic (offline, no network) ----------
  for (const p of stored) {
    const f = attFact(p);
    if (!f) { add('error', 'uncited', p, `metrics.attendance_pct=${p.metrics.attendance_pct} with NO cited fact`); continue; }
    if (!isSansad(f)) {
      add('error', 'source-mix', p, `attendance cited to "${f.source_name}" - not Digital Sansad; cohort mixes measurement windows (as_of "${f.as_of ?? '?'}")`);
    }
    const m = String(f.value).match(/([\d,]+)\s+of\s+([\d,]+)\s+sitting days/);
    if (m) {
      const num = +m[1].replace(/,/g, ''), den = +m[2].replace(/,/g, '');
      if (num > den) add('error', 'impossible', p, `${num} present of ${den} sitting days`);
      const calc = Math.round((num / den) * 1000) / 10;
      if (Math.abs(calc - (p.metrics.attendance_pct as number)) > 0.11)
        add('error', 'arithmetic', p, `fact says ${num}/${den} = ${calc}% but metrics say ${p.metrics.attendance_pct}%`);
    } else if (isSansad(f)) {
      add('warn', 'unparsed', p, `Sansad fact value not in "N of D sitting days" form: ${JSON.stringify(String(f.value).slice(0, 60))}`);
    }
    const pct = p.metrics.attendance_pct as number;
    if (!(pct >= 0 && pct <= 100)) add('error', 'range', p, `attendance_pct=${pct} out of range`);
  }

  // ---------- 2. Live re-derivation: LOK SABHA ----------
  console.log('LS: fetching sitting-member list…');
  const ml = await getJson('https://sansad.in/api_ls/member?loksabha=18&page=1&size=600&sitting=1&locale=en');
  const rawMembers: any[] = ml?.membersDtoList || [];
  if (!rawMembers.length) {
    console.error('LS member list empty - API shape changed? Aborting rather than reporting false diffs.');
    process.exit(2);
  }
  const members = rawMembers
    .map((m) => ({ mpsno: m.mpsno, name: [m.firstName, m.lastName].filter(Boolean).join(' '), cons: m.constName || '', state: m.stateName || '' }))
    .filter((m) => m.mpsno);
  console.log(`LS: ${members.length} sitting members from sansad.in`);

  const sess = await getJson('https://sansad.in/api_ls/business/getAllLoksabhaAndSession');
  let lsSessions: number[] = [];
  if (Array.isArray(sess)) {
    for (const row of sess) {
      const lk = row.loksabha ?? row.lkNo ?? row.loksabhaNo;
      if (String(lk) === '18') {
        const list = row.sessionList || row.sessions || row.session || [];
        for (const s of Array.isArray(list) ? list : [list]) {
          const n = parseInt(String(s.sessionNo ?? s.session ?? s), 10);
          if (Number.isFinite(n)) lsSessions.push(n);
        }
      }
    }
  }
  lsSessions = [...new Set(lsSessions)].sort((a, b) => a - b);
  if (!lsSessions.length) { console.error('LS session list empty - aborting.'); process.exit(2); }
  console.log(`LS-18 sessions: ${lsSessions.join(', ')}`);

  const ourLs = pols.filter((p) => p.house === 'Lok Sabha');
  const byConsState = new Map<string, Politician>();
  for (const p of ourLs) byConsState.set(norm(p.constituencyName) + '|' + norm(p.state), p);
  const pairs: { p: Politician; m: typeof members[number] }[] = [];
  for (const m of members) {
    let p = byConsState.get(norm(m.cons) + '|' + norm(m.state));
    if (!p) {
      const cands = ourLs.filter(
        (x) => norm(x.state) === norm(m.state) && lev(norm(x.constituencyName), norm(m.cons)) <= 2 && nameOverlap(x.name, m.name) >= 0.5,
      );
      if (cands.length === 1) p = cands[0];
    }
    if (p && (nameOverlap(p.name, m.name) >= 0.5 || tokens(m.name).size === 0)) pairs.push({ p, m });
  }
  console.log(`LS: matched ${pairs.length}/${members.length} to our seed\n`);

  // Only MPs that already claim a number need verifying (plus any --fix targets).
  const needFix = new Set(issues.filter((i) => i.kind === 'source-mix').map((i) => i.id));
  const toCheck = pairs.filter(({ p }) => p.metrics.attendance_pct !== undefined || needFix.has(p.id));
  const work = LIMIT === Infinity ? toCheck : toCheck.slice(0, LIMIT);
  console.log(`LS: re-deriving ${work.length} members from the official API…`);

  const lsDen = new Map<string, number>();
  let done = 0;
  for (const { p, m } of work) {
    let signed = 0, eligible = 0;
    for (const s of lsSessions) {
      const att = await getJson(`https://sansad.in/api_ls/member/getMemberAttendanceByMpsno?loksabha=18&session=${s}&mpsno=${m.mpsno}`);
      const groups: any[] = Array.isArray(att) ? att : att?.records || [];
      for (const g of groups) {
        const n = (g.dates || []).length;
        if (!n) continue;
        eligible += n;
        if (/^S/i.test(String(g.attendanceType || ''))) signed += n;
      }
      await sleep(120);
    }
    const q = await getJson(`https://sansad.in/api_ls/question/qetFilteredQuestionsAns?loksabhaNo=18&memberCode=${m.mpsno}&pageNo=1&pageSize=1&locale=en`);
    const qo = Array.isArray(q) ? q[0] : q;
    const liveQ: number | null = qo?.totalRecordSize ?? qo?.totalRecords ?? null;
    const d = await getJson(`https://sansad.in/api_ls/debate/participation?mpsno=${m.mpsno}&loksabha=18&house=LS`);
    const liveD: number | null = d?.participation ?? null;

    if (eligible >= 20) {
      const live = Math.round((signed / eligible) * 1000) / 10;
      lsDen.set(p.id, eligible);
      const cur = p.metrics.attendance_pct;
      if (cur === undefined) {
        if (FIX) applyLs(p, live, signed, eligible, liveQ, liveD);
      } else {
        const gap = Math.round((live - (cur as number)) * 100) / 100;
        if (Math.abs(gap) > DRIFT_PP) {
          // Stored ABOVE live is not explainable by new sittings - the number was wrong.
          const kind = gap < 0 ? 'stale-high' : 'drift';
          add(gap < 0 ? 'error' : 'warn', kind, p, `stored ${cur}% vs live ${live}% (${signed}/${eligible}), gap ${gap > 0 ? '+' : ''}${gap}pp`);
        }
        if (FIX) applyLs(p, live, signed, eligible, liveQ, liveD);
      }
    } else if (p.metrics.attendance_pct !== undefined) {
      add('error', 'no-live-basis', p, `stored ${p.metrics.attendance_pct}% but live API returns only ${eligible} eligible sitting days`);
      if (FIX) dropPerf(p);
    }

    // questions/debates: stored above live is impossible (counts only grow).
    if (typeof liveQ === 'number' && typeof p.metrics.questions_asked === 'number' && p.metrics.questions_asked > liveQ)
      add('error', 'stale-high', p, `questions_asked stored ${p.metrics.questions_asked} > live ${liveQ}`);
    if (typeof liveD === 'number' && typeof p.metrics.debates_participated === 'number' && p.metrics.debates_participated > liveD)
      add('error', 'stale-high', p, `debates_participated stored ${p.metrics.debates_participated} > live ${liveD}`);

    if (++done % 25 === 0) console.log(`  LS ${done}/${work.length}…`);
    await sleep(150);
  }

  // Denominator coherence: the modal eligible-day count is the full-tenure figure;
  // anything below it should mean a by-election joiner, not a broken fetch.
  if (lsDen.size) {
    const counts = new Map<number, number>();
    for (const v of lsDen.values()) counts.set(v, (counts.get(v) || 0) + 1);
    const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    console.log(`\nLS modal eligible sitting days: ${modal} (${counts.get(modal)} members)`);
    for (const [id, den] of lsDen) {
      if (den === modal) continue;
      const p = pols.find((x) => x.id === id)!;
      add('info', 'short-tenure', p, `${den} eligible sitting days vs modal ${modal} - expected for a by-election joiner; verify the member actually joined late`);
    }
  }

  // ---------- 3. Live re-derivation: RAJYA SABHA ----------
  console.log('\nRS: fetching sitting members + session list…');
  const rl = await getJson('https://sansad.in/api_rs/member/sitting-members?state=&party=&gender=&page=1&size=300&mpFlag=1&locale=en');
  const rsMembers: any[] = rl?.records || [];
  const sl = await getJson('https://integration.rajyasabha.digital/api-ext/api/v1/attendance/sessionlist', { Authorization: `Bearer ${RS_BEARER}` });
  const now = Date.now();
  const rsSessions: { no: number; sittings: number }[] = (Array.isArray(sl) ? sl : sl?.records || [])
    .filter((s: any) => s.period2 && new Date(s.period2).getTime() < now)
    .map((s: any) => ({ no: parseInt(String(s.sessionno), 10), sittings: parseInt(String(s.noofsittings ?? 0), 10) }))
    .filter((s: any) => Number.isFinite(s.no) && s.sittings > 0)
    .sort((a: any, b: any) => b.no - a.no)
    .slice(0, 6);

  if (!rsMembers.length || !rsSessions.length) {
    console.log('RS: member/session list unavailable - skipping RS verification (not reporting false diffs).');
  } else {
    console.log(`RS: ${rsMembers.length} members; sessions: ${rsSessions.map((s) => `${s.no}(${s.sittings}d)`).join(', ')}`);
    const present = new Map<number, number>();
    let totalSittings = 0;
    for (const s of rsSessions) {
      const att = await getJson(`https://integration.rajyasabha.digital/api-ext/api/v1/attendance/memberattendance?session=${s.no}`, { Authorization: `Bearer ${RS_BEARER}` });
      const rows: any[] = Array.isArray(att) ? att : att?.records || [];
      for (const r of rows) {
        const id = parseInt(String(r.mpsno ?? r.mpcode ?? 0), 10);
        const n = parseInt(String(r.noofsittings ?? r.present ?? 0), 10);
        if (id && Number.isFinite(n)) present.set(id, (present.get(id) || 0) + n);
      }
      totalSittings += s.sittings;
      await sleep(200);
    }
    console.log(`RS: aggregated over ${totalSittings} sitting days`);

    const ourRs = pols.filter((p) => p.house === 'Rajya Sabha');
    const seen = new Set<string>();
    if (totalSittings >= 20) {
      for (const rm of rsMembers) {
        const rname = [rm.firstName ?? rm.first_name, rm.lastName ?? rm.last_name].filter(Boolean).join(' ') || rm.name || '';
        const rstate = rm.stateName ?? rm.state ?? '';
        const cands = ourRs.filter((p) => nameOverlap(p.name, rname) >= 0.65 && (!rstate || norm(p.state) === norm(rstate) || norm(p.constituencyName).includes(norm(rstate))));
        if (cands.length !== 1) continue;
        const mpsno = parseInt(String(rm.mpsno ?? rm.mpCode ?? 0), 10);
        const days = present.get(mpsno);
        if (days === undefined) continue;
        const p = cands[0];
        seen.add(p.id);
        const live = Math.round((days / totalSittings) * 1000) / 10;
        if (live > 100) { add('error', 'impossible', p, `RS live ${days}/${totalSittings} > 100%`); continue; }
        const cur = p.metrics.attendance_pct;
        if (cur !== undefined) {
          const gap = Math.round((live - (cur as number)) * 100) / 100;
          if (Math.abs(gap) > DRIFT_PP)
            add(gap < 0 ? 'error' : 'warn', gap < 0 ? 'stale-high' : 'drift', p, `RS stored ${cur}% vs live ${live}% (${days}/${totalSittings}), gap ${gap > 0 ? '+' : ''}${gap}pp`);
        }
        if (FIX) {
          p.metrics.attendance_pct = live;
          p.facts = p.facts.filter((f) => f.field_type !== 'attendance_pct');
          p.facts.push({
            field_type: 'attendance_pct',
            value: `${live}% (${days} of ${totalSittings} sitting days, recent sessions)`,
            source_url: 'https://sansad.in/rs/attendance',
            source_name: 'Digital Sansad - Rajya Sabha (official)',
            retrieved_date: TODAY,
            as_of: `Rajya Sabha sessions ${rsSessions[rsSessions.length - 1].no}-${rsSessions[0].no}`,
          } as Fact);
        }
      }
    }
    // An RS member holding a number the live API no longer backs is unverifiable.
    for (const p of ourRs) {
      if (p.metrics.attendance_pct !== undefined && !seen.has(p.id)) {
        add('warn', 'unmatched-live', p, `RS stored ${p.metrics.attendance_pct}% but member not matched in the live API this run`);
      }
    }
  }

  // ---------- 4. Report ----------
  if (FIX) {
    // Anything still cited to a non-Sansad source after the refetch cannot be
    // ranked against Sansad-derived peers - drop rather than mix cohorts.
    for (const p of pols) {
      const f = attFact(p);
      if (f && !isSansad(f)) { dropPerf(p); console.log(`  dropped non-Sansad perf: ${p.id}`); }
    }
    writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');
    console.log('\n✓ seed rewritten from live Digital Sansad values.');
  }

  const bySev = (s: Sev) => issues.filter((i) => i.sev === s);
  const groups = new Map<string, Issue[]>();
  for (const i of issues) { if (!groups.has(i.kind)) groups.set(i.kind, []); groups.get(i.kind)!.push(i); }
  console.log(`\n${'='.repeat(66)}\nVERIFY-ATTENDANCE - ${stored.length} figures checked`);
  for (const [kind, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n[${list[0].sev.toUpperCase()}] ${kind} - ${list.length}`);
    for (const i of list.slice(0, 12)) console.log(`   ${i.id} (${i.name}): ${i.detail}`);
    if (list.length > 12) console.log(`   …and ${list.length - 12} more`);
  }
  const errs = bySev('error').length;
  console.log(`\n${'='.repeat(66)}`);
  console.log(`errors ${errs} · warnings ${bySev('warn').length} · info ${bySev('info').length}`);
  if (errs && !FIX) { console.log('\nRe-run with --fix to rewrite from live Sansad values.'); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
