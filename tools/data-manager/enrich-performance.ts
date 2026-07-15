/**
 * Data-manager step: PARLIAMENTARY PERFORMANCE metrics for MPs from the
 * OFFICIAL Digital Sansad APIs (sansad.in) - the primary source, so every
 * number is a government record, not an aggregator's.
 *
 *   Lok Sabha (18th):
 *     - attendance_pct        signed-register days / eligible sitting days,
 *                             aggregated across every session of LS-18
 *                             (api_ls/member/getMemberAttendanceByMpsno)
 *     - questions_asked       total questions (api_ls/question/qetFilteredQuestionsAns
 *                             with pageSize=1 → totalRecordSize)
 *     - debates_participated  api_ls/debate/participation
 *   Rajya Sabha (sitting members):
 *     - attendance_pct        present days / sitting days across recent sessions
 *                             (integration.rajyasabha.digital memberattendance;
 *                             uses the PUBLIC static bearer token embedded in
 *                             sansad.in's own frontend bundle)
 *
 * Join safety: LS MPs are matched by constituency+state (one member per seat),
 * with a name cross-check; RS members by name+state. Unmatched → skipped, logged.
 * Metrics feed the percentile-based performance score (lib/ranking.ts); a cited
 * fact is added alongside each metric. Facts fill gaps only; metrics are set
 * from official data (they were empty).
 *
 * Usage:  npm run dm -- enrich-performance
 *         PERF_LIMIT=20 npm run dm -- enrich-performance   (first 20 LS MPs)
 *         PERF_SKIP_RS=1 …                                 (Lok Sabha only)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Fact } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);
const LIMIT = process.env.PERF_LIMIT ? parseInt(process.env.PERF_LIMIT, 10) : Infinity;
const SKIP_RS = process.env.PERF_SKIP_RS === '1';
// PERF_REFRESH re-fetches even MPs that already have metrics and OVERWRITES them
// (attendance/questions grow each session) - used by `update-all` to stay current.
const REFRESH = process.env.PERF_REFRESH === '1';
// Public token sansad.in's own frontend ships for the RS attendance service.
const RS_BEARER = 'Y0hKaFltaGhkQzVyYVhKaGJn';

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

interface LsMember { mpsno: number; name: string; cons: string; state: string }

async function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  let touched = 0, factsAdded = 0;

  // ============================ LOK SABHA ============================
  console.log('LS: fetching sitting-member list…');
  const ml = await getJson('https://sansad.in/api_ls/member?loksabha=18&page=1&size=600&sitting=1&locale=en');
  const rawMembers: any[] = ml?.membersDtoList || [];
  const members: LsMember[] = rawMembers.map((m) => ({
    mpsno: m.mpsno,
    name: [m.firstName, m.lastName].filter(Boolean).join(' '),
    cons: m.constName || '',
    state: m.stateName || '',
  })).filter((m) => m.mpsno);
  console.log(`LS: ${members.length} sitting members from sansad.in`);
  if (!members.length) throw new Error('LS member list empty - API shape changed?');

  // Sessions of the 18th Lok Sabha (for attendance aggregation).
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
  if (!lsSessions.length) lsSessions = [1, 2, 3, 4, 5, 6]; // defensive fallback
  console.log(`LS-18 sessions: ${lsSessions.join(', ')}`);

  // Match sansad members to our LS records: constituency+state, then name check.
  const ourLs = pols.filter((p) => p.house === 'Lok Sabha');
  const byConsState = new Map<string, Politician>();
  for (const p of ourLs) byConsState.set(norm(p.constituencyName) + '|' + norm(p.state), p);
  const pairs: { p: Politician; m: LsMember }[] = [];
  const unmatched: string[] = [];
  for (const m of members) {
    let p = byConsState.get(norm(m.cons) + '|' + norm(m.state));
    if (!p) {
      // Transliteration fallback: unique same-state seat within edit distance 2
      // whose member name also agrees (Narsapuram/Narasapuram, Kodarma/Koderma).
      const cands = ourLs.filter(
        (x) => norm(x.state) === norm(m.state) && lev(norm(x.constituencyName), norm(m.cons)) <= 2 && nameOverlap(x.name, m.name) >= 0.5,
      );
      if (cands.length === 1) p = cands[0];
    }
    if (p && (nameOverlap(p.name, m.name) >= 0.5 || tokens(m.name).size === 0)) pairs.push({ p, m });
    else if (p) unmatched.push(`${m.name} vs ${p.name} @ ${m.cons} (name mismatch)`);
    else unmatched.push(`${m.name} @ ${m.cons}, ${m.state} (no seat match)`);
  }
  console.log(`LS matched ${pairs.length}/${members.length}; unmatched ${unmatched.length}`);
  // Resumable per metric: checkpoints write the seed every 25 MPs, and each
  // metric is fetched only if still missing - so a re-run backfills exactly
  // the gaps (e.g. a questions-only pass costs one request per MP).
  // In REFRESH mode we re-do everyone and overwrite (metrics grow each session).
  const isPerfFact = (f: Fact) => /Digital Sansad/i.test(f.source_name || '');
  const perfFields = new Set(['attendance_pct', 'questions_asked', 'debates_participated']);
  const pending = REFRESH
    ? pairs
    : pairs.filter(
        ({ p }) =>
          p.metrics.attendance_pct === undefined ||
          p.metrics.debates_participated === undefined ||
          p.metrics.questions_asked === undefined,
      );
  console.log(`LS pending (no metrics yet): ${pending.length}`);
  const work = LIMIT === Infinity ? pending : pending.slice(0, LIMIT);

  const lsCite = (path: string): Omit<Fact, 'field_type' | 'value'> => ({
    source_url: `https://sansad.in${path}`,
    source_name: 'Digital Sansad - Lok Sabha (official)',
    retrieved_date: TODAY,
    as_of: '18th Lok Sabha, all sessions to date',
  } as any);

  let done = 0;
  for (const { p, m } of work) {
    // REFRESH: clear prior Sansad metrics/facts so this pass fully overwrites.
    if (REFRESH) {
      for (const f of perfFields) delete (p.metrics as Record<string, number | undefined>)[f];
      p.facts = p.facts.filter((f) => !(perfFields.has(f.field_type) && isPerfFact(f)));
    }
    // 1. attendance: date-grouped by type per session; S* variants = signed.
    let signed = 0, eligible = 0;
    if (p.metrics.attendance_pct === undefined) {
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
    }
    // 2. questions: total via pageSize=1 (response is an ARRAY; the count lives
    //    inside its first element as totalRecordSize)
    let questions: number | null = null;
    if (p.metrics.questions_asked === undefined) {
      const q = await getJson(`https://sansad.in/api_ls/question/qetFilteredQuestionsAns?loksabhaNo=18&memberCode=${m.mpsno}&pageNo=1&pageSize=1&locale=en`);
      const qo = Array.isArray(q) ? q[0] : q;
      questions = qo?.totalRecordSize ?? qo?.totalRecords ?? null;
    }
    // 3. debates
    let debates: number | null = null;
    if (p.metrics.debates_participated === undefined) {
      const d = await getJson(`https://sansad.in/api_ls/debate/participation?mpsno=${m.mpsno}&loksabha=18&house=LS`);
      debates = d?.participation ?? null;
    }

    const have = new Set(p.facts.map((f) => f.field_type));
    const addFact = (ft: string, val: string, path: string) => {
      if (!have.has(ft)) { p.facts.push({ field_type: ft, value: val, ...lsCite(path) } as Fact); have.add(ft); factsAdded++; }
    };
    let did = false;
    if (eligible >= 20) { // require a meaningful base of sitting days
      const pct = Math.round((signed / eligible) * 1000) / 10;
      p.metrics.attendance_pct = pct;
      addFact('attendance_pct', `${pct}% (${signed} of ${eligible} sitting days signed)`, '/ls/members');
      did = true;
    }
    if (typeof questions === 'number') {
      p.metrics.questions_asked = questions;
      addFact('questions_asked', String(questions), '/ls/questions/questions-and-answers');
      did = true;
    }
    if (typeof debates === 'number') {
      p.metrics.debates_participated = debates;
      addFact('debates_participated', String(debates), '/ls/debates');
      did = true;
    }
    if (did) touched++;
    if (++done % 25 === 0) {
      console.log(`  LS ${done}/${work.length} (last: ${p.name} att=${eligible ? Math.round((signed / eligible) * 100) + '%' : 'n/a'} q=${questions} d=${debates})`);
      writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n'); // checkpoint
    }
    await sleep(150);
  }

  // ============================ RAJYA SABHA ============================
  if (!SKIP_RS) {
    console.log('\nRS: fetching sitting members + session list…');
    const rl = await getJson('https://sansad.in/api_rs/member/sitting-members?state=&party=&gender=&page=1&size=300&mpFlag=1&locale=en');
    const rsMembers: any[] = rl?.records || [];
    const sl = await getJson('https://integration.rajyasabha.digital/api-ext/api/v1/attendance/sessionlist', { Authorization: `Bearer ${RS_BEARER}` });
    // Rows: { sessionno: "271", period: start, period2: end, noofsittings } -
    // keep only sessions that have ENDED (271 is a future Monsoon session), take
    // the most recent 6, and use each session's own noofsittings as denominator.
    const now = Date.now();
    const rsSessions: { no: number; sittings: number }[] = (Array.isArray(sl) ? sl : sl?.records || [])
      .filter((s: any) => s.period2 && new Date(s.period2).getTime() < now)
      .map((s: any) => ({ no: parseInt(String(s.sessionno), 10), sittings: parseInt(String(s.noofsittings ?? 0), 10) }))
      .filter((s: any) => Number.isFinite(s.no) && s.sittings > 0)
      .sort((a: any, b: any) => b.no - a.no)
      .slice(0, 6);
    console.log(`RS: ${rsMembers.length} members; sessions used: ${rsSessions.map((s) => `${s.no}(${s.sittings}d)`).join(', ')}`);

    if (rsMembers.length && rsSessions.length) {
      // Whole-house per-session member counts (1 call per session).
      const present = new Map<number, number>(); // mpsno -> present days
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
      console.log(`RS: attendance aggregated over ${totalSittings} sitting days`);

      const ourRs = pols.filter((p) => p.house === 'Rajya Sabha');
      let rsMatched = 0;
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
          const pct = Math.round((days / totalSittings) * 1000) / 10;
          if (pct > 100) continue; // defensive: bad denominator
          if (REFRESH) p.facts = p.facts.filter((f) => !(f.field_type === 'attendance_pct' && isPerfFact(f)));
          p.metrics.attendance_pct = pct;
          const have = new Set(p.facts.map((f) => f.field_type));
          if (!have.has('attendance_pct')) {
            p.facts.push({
              field_type: 'attendance_pct',
              value: `${pct}% (${days} of ${totalSittings} sitting days, recent sessions)`,
              source_url: 'https://sansad.in/rs/attendance',
              source_name: 'Digital Sansad - Rajya Sabha (official)',
              retrieved_date: TODAY,
              as_of: `Rajya Sabha sessions ${rsSessions[rsSessions.length - 1].no}-${rsSessions[0].no}`,
            } as any);
            factsAdded++;
          }
          touched++; rsMatched++;
        }
      }
      console.log(`RS: matched + filled ${rsMatched}`);
    } else {
      console.log('RS: skipped (member list or session list unavailable)');
    }
  }

  writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');
  console.log(`\n✓ enrich-performance: ${touched} MPs got official metrics; +${factsAdded} cited facts.`);
  if (unmatched.length) console.log(`  LS unmatched (${unmatched.length}): ${unmatched.slice(0, 8).join('; ')}…`);
  console.log('Next: npm run dm -- validate, rebuild indexes, build.');
}

main().catch((e) => { console.error(e); process.exit(1); });
