// GLANCE layer over lib/role-accountability.ts: 3-4 short bullets per role so
// a profile can say what someone is accountable for in one screen. This is a
// COMPRESSION of the verified full text (same claims, fewer words - sources
// stay with the full cards); do not add claims here that are not in
// role-accountability.ts.
import type { RoleKey } from './role-accountability';

export interface RoleGlance {
  /** Short bullets when this is the person's senior-most role. */
  glance: string[];
  /** Shorter, non-overlapping bullets used when the person ALSO holds a more
   *  senior (executive) role - avoids repeating attendance/ethics twice. */
  glanceSecondary?: string[];
}

export const ROLE_GLANCE: Record<string, RoleGlance> = {
  pm: {
    glance: [
      'The whole Union government’s performance - collectively responsible to the Lok Sabha',
      'Answering Parliament: questions, debates and no-confidence motions',
      'Lawful, honest use of public money and of the office',
      'Results in the ministries the PM personally holds (PMO, Personnel, Atomic Energy, Space)',
    ],
  },
  unionCabinet: {
    glance: [
      'Running their ministry - schemes, services and spending actually delivering',
      'Answering Parliament for that ministry, honestly and on time',
      'No waste, corruption or conflicts of interest; assets declared yearly',
    ],
  },
  unionMos: {
    glance: [
      'Delivering the subjects or department assigned to them',
      'Answering Parliament for that work - questions, debates, assurances',
      'Lawful use of powers and budget; assets and interests declared',
    ],
  },
  cm: {
    glance: [
      'Running the state government - schools, hospitals, police, roads, water',
      'Keeping the Assembly’s confidence and answering it for every department',
      'State budget spent honestly; law & order maintained',
      'Leading the state’s disaster and emergency response',
    ],
  },
  dyCm: {
    glance: [
      'Running the departments they hold (the "Deputy CM" title adds no extra legal power)',
      'Answering the Assembly for those departments',
      'Honest use of their departments’ budgets and schemes',
    ],
  },
  stateCabinet: {
    glance: [
      'Running the state department(s) they hold - delivery, budgets, results',
      'Answering the Assembly: Question Hour, debates and kept assurances',
      'Merit-based transfers, tenders and appointments - no favouritism',
    ],
  },
  lokSabha: {
    glance: [
      'Attending Parliament; debating and voting on laws and the Budget',
      'Questioning the central government on your behalf',
      'Honest use of MPLADS funds (≈₹5 crore/year) for local works',
      'Being reachable - constituency office, grievances, help with central schemes',
    ],
    glanceSecondary: [
      'As your MP: attending Parliament, raising local issues, honest MPLADS use',
      'Staying reachable to the constituency that elected them',
    ],
  },
  rajyaSabha: {
    glance: [
      'Attending the Rajya Sabha; scrutinising laws and the Budget',
      'Representing their state’s interests in national law-making',
      'Honest use of the MPLADS entitlement within their state',
      'Transparency - declared assets and registered interests',
    ],
    glanceSecondary: [
      'As a Rajya Sabha MP: attending the House and representing their state',
    ],
  },
  mla: {
    glance: [
      'Attending the Assembly; making state laws; passing the state budget',
      'Raising your area’s problems with ministers and officials',
      'Honest use of the MLA local-area fund (where the state runs one)',
      'Being reachable to everyone in the constituency',
    ],
    glanceSecondary: [
      'As your MLA: attending the Assembly and raising local issues',
      'Staying reachable to the constituency that elected them',
    ],
  },
  mlc: {
    glance: [
      'Attending the Legislative Council; scrutinising state laws and budgets',
      'Representing their electorate (teachers, graduates, local bodies or MLAs)',
      'Transparency - declared assets and interests',
    ],
    glanceSecondary: [
      'As an MLC: attending the Council and scrutinising state legislation',
    ],
  },
  mayor: {
    glance: [
      'Leading the municipal body - city services, sanitation, local works',
      'Answering the elected council for civic delivery and spending',
    ],
  },
  localBody: {
    glance: [
      'Local services - water, drains, streetlights, sanitation, local roads',
      'Answering ward residents and the panchayat/council for local spending',
    ],
  },
};

export function roleGlance(roleKey: RoleKey | string, secondary = false): string[] {
  const g = ROLE_GLANCE[roleKey];
  if (!g) return [];
  return secondary && g.glanceSecondary ? g.glanceSecondary : g.glance;
}
