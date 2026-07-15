/**
 * Data-manager step: LINK each Council-of-Ministers record (state governments,
 * and any stray central ones) to the sitting-legislator profile it refers to, by
 * setting `politicianId`. Without this a minister - including every CM - renders
 * as a THIN DUPLICATE person page disconnected from their real MLA/MP record
 * (facts, affidavit, constituency), and the minister card links there instead of
 * to the real profile. That is the "the Chief Minister is lost" symptom: the CM
 * card led to a stub, not the actual person.
 *
 * With politicianId set, getPerson() redirects the minister id to the real
 * profile, the profile shows the ministerial role, and search stops duplicating.
 *
 * Match is name-within-state, unique: exact normalised name first, then a strong
 * token-overlap fallback; ambiguous or unmatched records are left unlinked (they
 * keep their own stub page - correct for a minister who holds no seat we track).
 *
 * Usage:  npm run dm -- link-ministers
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed');

const HON = /\b(dr|adv|advocate|shri|sri|smt|kumari|selvi|thiru|tmt|mr|mrs|ms|prof|er|md|mohd|mohammad|mohammed|syed|alhaj|haji|col|capt|maj|lt|late)\b/g;
const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(HON, ' ').replace(/[^a-z0-9]+/g, '');
const tokens = (s: string) =>
  new Set((s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(HON, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 1));
function jac(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let i = 0; for (const t of a) if (b.has(t)) i++;
  return i / (a.size + b.size - i);
}

interface Minister { id: string; name: string; stateCode?: string; constituency?: string; rank?: string; politicianId?: string }

/** Find the unique politician in a state that a minister refers to. */
function resolvePol(m: Minister, inState: Politician[]): string | null {
  const nm = normName(m.name);
  const exact = inState.filter((p) => normName(p.name) === nm);
  const pick = (cands: Politician[]): string | null => {
    if (cands.length === 1) return cands[0].id;
    if (cands.length > 1) {
      // Disambiguate by the minister's declared constituency if present…
      if (m.constituency) {
        const byCons = cands.filter((p) => normName(p.constituencyName) === normName(m.constituency!));
        if (byCons.length === 1) return byCons[0].id;
      }
      // …else prefer an Assembly seat (most ministers are MLAs), then Council.
      const mla = cands.filter((p) => p.house === 'Vidhan Sabha');
      if (mla.length === 1) return mla[0].id;
      const mlc = cands.filter((p) => p.house === 'Vidhan Parishad');
      if (mlc.length === 1) return mlc[0].id;
    }
    return null;
  };
  const e = pick(exact);
  if (e) return e;
  // Fuzzy fallback: strong unique token overlap.
  const mt = tokens(m.name);
  const fuzzy = inState.filter((p) => jac(tokens(p.name), mt) >= 0.6);
  return pick(fuzzy);
}

function main() {
  const pols: Politician[] = JSON.parse(readFileSync(resolve(SEED, 'politicians.json'), 'utf8'));
  const byId = new Map(pols.map((p) => [p.id, p]));
  const byState = new Map<string, Politician[]>();
  for (const p of pols) { if (!byState.has(p.stateCode)) byState.set(p.stateCode, []); byState.get(p.stateCode)!.push(p); }

  let linked = 0, already = 0;
  const unlinked: string[] = [];

  // --- State governments ---
  const sgPath = resolve(SEED, 'state_government.json');
  const sgRaw = JSON.parse(readFileSync(sgPath, 'utf8'));
  const states = Array.isArray(sgRaw) ? sgRaw : Object.values(sgRaw);
  for (const s of states as any[]) {
    const inState = byState.get(s.stateCode) || [];
    for (const m of (s.ministers || []) as Minister[]) {
      if (m.politicianId && byId.has(m.politicianId)) { already++; continue; }
      const pid = resolvePol({ ...m, stateCode: s.stateCode }, inState);
      if (pid) { m.politicianId = pid; linked++; }
      else unlinked.push(`${m.name} (${s.stateCode} ${m.rank || ''})`);
    }
  }
  writeFileSync(sgPath, JSON.stringify(sgRaw, null, 2) + '\n');

  // --- Central government (fill any stragglers by name, any house) ---
  const cgPath = resolve(SEED, 'central_government.json');
  const cgRaw = JSON.parse(readFileSync(cgPath, 'utf8'));
  const cg = Array.isArray(cgRaw) ? cgRaw : (cgRaw.ministers || []);
  let cLinked = 0;
  for (const m of cg as Minister[]) {
    if (m.politicianId && byId.has(m.politicianId)) { already++; continue; }
    const nm = normName(m.name);
    const cand = pols.filter((p) => normName(p.name) === nm);
    if (cand.length === 1) { m.politicianId = cand[0].id; cLinked++; linked++; }
    else unlinked.push(`${m.name} (central ${m.rank || ''})`);
  }
  writeFileSync(cgPath, JSON.stringify(cgRaw, null, 2) + '\n');

  console.log(`✓ link-ministers: linked ${linked} (state + ${cLinked} central), ${already} already linked, ${unlinked.length} left unlinked.`);
  if (unlinked.length) console.log(`  unlinked (kept own stub - likely not a legislator we track): ${unlinked.slice(0, 20).join('; ')}${unlinked.length > 20 ? ` …+${unlinked.length - 20}` : ''}`);
}

main();
