// The "real people" layer of the responsibility finder.
//
// PROBLEM_ROUTES / ESCALATION_CHAINS (lib/offices, lib/escalation) describe the
// durable OFFICES and reporting chains. This module resolves those roles to the
// actual people we track for a given state + district:
//   - the district's verified DM / SP incumbents (info-only, where sourced)
//   - the state minister(s) whose PORTFOLIO covers the problem's department
//   - the Chief Minister (heads the state government - final political owner)
//   - the district's own MLAs and MPs (the parallel elected lever)
//
// Pure + isomorphic: used by the client Finder (fed from /who/{ST}.json) and
// by the district page (fed server-side from the seed).
import type { ContactChannel, ProblemType } from './types';

/** Compact person for the finder payloads (kept tiny - shipped to clients). */
export interface WhoPerson {
  id: string;
  name: string;
  party?: string;
  photo?: string;
  /** Constituency (MLA/MP) or rank label (ministers). */
  sub?: string;
  portfolios?: string[];
}

export interface WhoOfficial {
  officeType: 'collector_dm' | 'sp_district';
  name?: string;
  service?: string;
  email?: string;
  phone?: string;
  asOf?: string;
  sourceName?: string;
  sourceUrl?: string;
}

/** The district's own official site - the durable fallback when no officer is named. */
export interface WhoPortal {
  url: string;
  whosWhoUrl?: string;
  contactUrl?: string;
  phone?: string;
  email?: string;
  retrieved?: string;
}

export interface WhoDistrict {
  officials: WhoOfficial[];
  mlas: WhoPerson[];
  mps: WhoPerson[];
  /** Present when we proved the district's site live at build time. */
  portal?: WhoPortal;
}

/** One state's payload (public/who/{ST}.json). */
export interface WhoStateFile {
  v: 1;
  stateCode: string;
  state: string;
  asOf?: string;
  cm?: WhoPerson;
  ministers: WhoPerson[]; // full council incl. DyCMs (rank in sub)
  districts: Record<string, WhoDistrict>;
  /** This state's channels + the national ones, so the client needs one fetch. */
  channels?: ContactChannel[];
}

// ---------------------------------------------------------------------------
// Problem → state-department matching. State portfolio names vary a lot
// ("Urban Development", "Municipal Administration", "Local Self Government"…),
// so each problem lists lowercase keywords; a minister matches when ANY
// portfolio contains ANY keyword. Urban/rural variants differ where the
// owning department differs.
// ---------------------------------------------------------------------------
const URBAN_LOCAL = ['municipal', 'urban', 'local self', 'local administration', 'local bodies', 'town'];
const RURAL_LOCAL = ['panchayat', 'rural development', 'rural works'];

const PROBLEM_PORTFOLIO: Record<ProblemType, { urban: string[]; rural: string[] }> = {
  roads: {
    urban: [...URBAN_LOCAL, 'public works', 'pwd', 'roads'],
    rural: ['public works', 'pwd', 'roads', 'buildings', ...RURAL_LOCAL],
  },
  water: {
    urban: ['water supply', 'drinking water', ...URBAN_LOCAL],
    rural: ['water supply', 'drinking water', 'public health engineering', 'phed', ...RURAL_LOCAL],
  },
  sanitation: { urban: URBAN_LOCAL, rural: RURAL_LOCAL },
  sewerage: { urban: URBAN_LOCAL, rural: RURAL_LOCAL },
  streetlights: { urban: URBAN_LOCAL, rural: [...RURAL_LOCAL, 'energy', 'power'] },
  police: { urban: ['home'], rural: ['home'] },
  health: { urban: ['health', 'medical'], rural: ['health', 'medical'] },
  school: { urban: ['education'], rural: ['education'] },
  certificates: { urban: ['revenue', 'general administration'], rural: ['revenue', 'general administration'] },
  land: { urban: ['revenue', 'land'], rural: ['revenue', 'land'] },
  birth_death: { urban: URBAN_LOCAL, rural: [...RURAL_LOCAL, 'health'] },
  electricity: { urban: ['energy', 'power', 'electricity'], rural: ['energy', 'power', 'electricity'] },
  ration: { urban: ['food', 'civil supplies', 'consumer', 'public distribution'], rural: ['food', 'civil supplies', 'consumer', 'public distribution'] },
  property_tax: { urban: URBAN_LOCAL, rural: RURAL_LOCAL },
};

/** The state minister(s) whose portfolios cover this problem (max `limit`).
 *  The CM is excluded here - always shown separately as the final owner. */
export function ministersForProblem(
  ministers: WhoPerson[],
  cmId: string | undefined,
  problem: ProblemType,
  area: 'urban' | 'rural',
  limit = 2,
): WhoPerson[] {
  const keywords = PROBLEM_PORTFOLIO[problem][area];
  const hits: { m: WhoPerson; score: number }[] = [];
  for (const m of ministers) {
    if (!m.portfolios || m.id === cmId) continue;
    let score = 0;
    for (const pf of m.portfolios) {
      const low = pf.toLowerCase();
      for (let i = 0; i < keywords.length; i++) {
        // earlier keywords are more specific → higher score
        if (low.includes(keywords[i])) score = Math.max(score, keywords.length - i);
      }
    }
    if (score > 0) hits.push({ m, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.m);
}

/** Does this problem's chain involve the police (SP) rather than only the DM? */
export function isPoliceProblem(problem: ProblemType): boolean {
  return problem === 'police';
}
