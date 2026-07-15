/**
 * Data-manager step: build data/seed/state_government.json from the verified
 * output of the `ryp-state-governments` workflow (per-state Council of Ministers,
 * web-grounded + adversarially verified with citations).
 *
 * Usage:  npx tsx tools/data-manager/import-state-gov.ts <workflow-output.json|.output>
 * The input may be the raw workflow result ({states:[...]}) or the task .output
 * wrapper ({result:{states:[...]}}).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { StateGovernment, StateMinister, StateMinisterRank } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const TODAY = new Date().toISOString().slice(0, 10);

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const slug = (s: string) => decode(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const hostOf = (u?: string) => { if (!u) return undefined; try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return undefined; } };

interface WFPerson { name?: string; party?: string; portfolios?: string[]; sourceUrl?: string }
interface WFState {
  stateCode: string; state: string; governmentStatus: string;
  chiefMinister?: WFPerson; deputyChiefMinisters?: WFPerson[]; cabinetMinisters?: WFPerson[]; ministersOfState?: WFPerson[];
  governor?: { name?: string; title?: string; sourceUrl?: string };
  asOf?: string; confidence?: string; sources?: string[];
}

function main() {
  const path = process.argv[2];
  if (!path) { console.error('Usage: import-state-gov <workflow-output.json>'); process.exit(1); }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const wfStates: WFState[] = raw.states || raw.result?.states || [];
  if (!wfStates.length) { console.error('No states found in input.'); process.exit(1); }

  const govs: StateGovernment[] = [];
  let ministerCount = 0;
  for (const s of wfStates) {
    const seen = new Map<string, number>();
    const mk = (p: WFPerson | undefined, rank: StateMinisterRank): StateMinister | null => {
      const name = decode(p?.name || '');
      if (!name || name.length < 2) return null;
      if (/president'?s rule|vacant seat/i.test(name)) return null;
      if (/^(n\/?a|unknown|tbd|none|nil|vacant|-|-)$/i.test(name)) return null; // standalone placeholders only
      let id = slug(`${name}-${s.stateCode}`);
      const n = (seen.get(id) || 0) + 1; seen.set(id, n);
      if (n > 1) id = `${id}-${n}`;
      const src = p?.sourceUrl || s.sources?.[0];
      return {
        id, stateCode: s.stateCode, state: s.state, rank, name,
        party: decode(p?.party || '') || 'Independent',
        portfolios: (p?.portfolios || []).map(decode).filter(Boolean),
        source_url: src, source_name: hostOf(src) || 'State government (verified)',
        retrieved_date: TODAY, as_of: s.asOf,
      };
    };
    const ministers: StateMinister[] = [];
    const cm = mk(s.chiefMinister, 'CM'); if (cm) ministers.push(cm);
    for (const p of s.deputyChiefMinisters || []) { const m = mk(p, 'DyCM'); if (m) ministers.push(m); }
    for (const p of s.cabinetMinisters || []) { const m = mk(p, 'Cabinet'); if (m) ministers.push(m); }
    for (const p of s.ministersOfState || []) { const m = mk(p, 'MoS'); if (m) ministers.push(m); }
    ministerCount += ministers.length;

    govs.push({
      stateCode: s.stateCode,
      state: s.state,
      governmentStatus: (s.governmentStatus as StateGovernment['governmentStatus']) || 'uncertain',
      asOf: s.asOf,
      confidence: (s.confidence as StateGovernment['confidence']) || 'low',
      governor: s.governor?.name ? { name: decode(s.governor.name), title: s.governor.title ? decode(s.governor.title) : undefined, sourceUrl: s.governor.sourceUrl } : undefined,
      ministers,
      sources: (s.sources || []).filter(Boolean),
    });
  }
  govs.sort((a, b) => a.state.localeCompare(b.state));
  writeFileSync(resolve(SEED_DIR, 'state_government.json'), JSON.stringify(govs, null, 2) + '\n');
  const conf = govs.reduce<Record<string, number>>((a, g) => ((a[g.confidence] = (a[g.confidence] || 0) + 1), a), {});
  console.log(`✓ Wrote ${govs.length} state governments, ${ministerCount} ministers. Confidence: ${JSON.stringify(conf)}`);
  console.log(`ℹ President's Rule / uncertain: ${govs.filter((g) => g.governmentStatus !== 'elected').map((g) => g.stateCode).join(', ') || 'none'}`);
}

main();
