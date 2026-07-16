// Which published contact channels are relevant to a given problem, and in what
// order to offer them.
//
// The accountability ladder names a real officer wherever we have one, but for
// most of India's ~600 districts we do not, and pretending otherwise would mean
// inventing names that rot within months. So every rung that lacks an incumbent
// falls back to channels that DON'T rot: the district's own Who's Who directory
// (the district keeps it current), the state's grievance helpline, and the
// national helpline for that kind of problem. A citizen with a burst water main
// needs a number to call - not the name of an officer who was transferred.
import type { ContactChannel, ContactTopic, ProblemType } from './types';

/**
 * problem -> the channel topics worth showing, most specific first. A person
 * reporting a power cut wants the electricity helpline before a generic
 * grievance portal; someone reporting a crime wants police/emergency first.
 * 'grievance' is the universal backstop, so it ends every list.
 */
export const PROBLEM_TOPICS: Record<ProblemType, ContactTopic[]> = {
  roads: ['road', 'grievance'],
  water: ['water', 'grievance'],
  sanitation: ['grievance'],
  sewerage: ['water', 'grievance'],
  streetlights: ['electricity', 'grievance'],
  police: ['police', 'emergency', 'women', 'cyber', 'grievance'],
  health: ['health', 'ambulance', 'emergency', 'grievance'],
  school: ['child', 'grievance'],
  certificates: ['grievance'],
  land: ['grievance', 'corruption'],
  birth_death: ['grievance'],
  electricity: ['electricity', 'grievance'],
  ration: ['ration', 'grievance'],
  property_tax: ['grievance'],
};

/**
 * Is this channel for people in `district`? Channels carry a `districts`
 * service-area list only when an operator provably serves part of a state
 * (electricity discoms above all): listed districts are the ONLY places it
 * shows, so a Mysuru resident never sees Bengaluru's operator ranked above
 * their own. Untagged channels serve their whole scope and always qualify.
 */
function servesDistrict(c: ContactChannel, district?: string): boolean {
  if (!c.districts || !district) return true;
  return c.districts.includes(district);
}

/** True only when the channel is POSITIVELY known to cover this district. */
function isLocalMatch(c: ContactChannel, district?: string): boolean {
  return !!district && !!c.districts && c.districts.includes(district);
}

const KIND_ORDER: Record<ContactChannel['kind'], number> = { phone: 0, email: 1, url: 2 };

/**
 * Channels to show for a problem, deduped by value, capped so the ladder stays
 * glanceable. Order: operators verified to serve THIS district, then statewide,
 * then national - and within each, phones before portals (a number is the
 * faster lever when something is actually broken).
 */
export function channelsForProblem(
  all: ContactChannel[],
  problem: ProblemType,
  limit = 4,
  district?: string,
): ContactChannel[] {
  const topics = PROBLEM_TOPICS[problem] || ['grievance'];
  const rank = (c: ContactChannel) => {
    const ti = topics.indexOf(c.topic);
    if (ti === -1) return 9999;
    const place = isLocalMatch(c, district) ? 0 : c.scope === 'state' ? 10 : 20;
    return ti * 100 + place + KIND_ORDER[c.kind];
  };
  const seen = new Set<string>();
  return all
    .filter((c) => topics.includes(c.topic) && servesDistrict(c, district))
    .sort((a, b) => rank(a) - rank(b))
    .filter((c) => {
      const k = `${c.kind}:${c.value}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

/**
 * The same channels grouped one card per ORGANISATION, so a body's phone,
 * email and portal render as separate actions on one card instead of three
 * interleaved rows. Groups keep the rank order of their best channel; every
 * operator serving the district is kept (that is the point - an area with
 * several electricity providers must show all of them), the cap only trims
 * the generic tail.
 */
export interface OperatorGroup {
  /** Card title: the operator, or the single channel's label when untagged. */
  title: string;
  local: boolean;
  scope: 'national' | 'state';
  channels: ContactChannel[];
}

export function operatorGroupsForProblem(
  all: ContactChannel[],
  problem: ProblemType,
  district?: string,
  maxGroups = 5,
): OperatorGroup[] {
  // A generous flat cut first (dedupe + rank); grouping decides the real cap.
  const picks = channelsForProblem(all, problem, 24, district);
  const groups: OperatorGroup[] = [];
  const byKey = new Map<string, OperatorGroup>();
  for (const c of picks) {
    const key = c.operator ? `${c.scope}:${c.operator}` : `one:${c.kind}:${c.value}`;
    let g = byKey.get(key);
    if (!g) {
      g = { title: c.operator || c.label, local: false, scope: c.scope, channels: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.local = g.local || isLocalMatch(c, district);
    g.channels.push(c);
  }
  // Local groups rank first, so the cap can only ever trim the generic tail;
  // it still leaves room for the statewide + national backstops after them.
  const localCount = groups.filter((g) => g.local).length;
  return groups.slice(0, Math.max(maxGroups, localCount + 2));
}

/** The single most useful channel for a problem (used in tight/compact spots). */
export function primaryChannel(all: ContactChannel[], problem: ProblemType, district?: string): ContactChannel | undefined {
  return channelsForProblem(all, problem, 1, district)[0];
}

/**
 * The best number to CALL for a problem, or undefined if only portals exist.
 * Callers that render a dial button need this rather than primaryChannel, which
 * may legitimately return a URL.
 */
export function primaryPhone(all: ContactChannel[], problem: ProblemType, district?: string): ContactChannel | undefined {
  return channelsForProblem(all.filter((c) => c.kind === 'phone'), problem, 1, district)[0];
}

/**
 * The state's own directory of district websites - every state publishes one,
 * and it is the backstop for the ~17% of districts whose individual site we
 * could not verify: the citizen still lands one click from their collectorate
 * instead of nowhere.
 */
export function districtDirectory(channels: ContactChannel[] | undefined): ContactChannel | undefined {
  return (channels ?? []).find((c) => c.kind === 'url' && c.scope === 'state' && /district/i.test(c.label));
}

/**
 * Will a contact fallback actually render anything for this problem? Callers use
 * this to pick their wording: promising a directory "below" and then rendering
 * nothing is worse than plainly saying we don't have it.
 */
export function hasContactFallback(
  portal: { url?: string } | undefined,
  channels: ContactChannel[] | undefined,
  problem: ProblemType,
  district?: string,
): boolean {
  return (
    !!portal?.url ||
    !!districtDirectory(channels) ||
    channelsForProblem(channels ?? [], problem, 1, district).length > 0
  );
}

/** tel: href - Indian short codes (112, 1098) must not be prefixed with +91. */
export function telHref(value: string): string {
  const v = value.replace(/[^\d]/g, '');
  if (v.length <= 6) return `tel:${v}`;           // short code, dial as-is
  if (v.startsWith('0') || v.startsWith('1800') || v.startsWith('1860')) return `tel:${v}`; // STD / toll-free
  return `tel:+91${v}`;
}

/** Display form: group digits so a long number stays readable. */
export function formatPhone(value: string): string {
  const v = value.replace(/[^\d]/g, '');
  if (v.length <= 6) return v;
  if (v.startsWith('1800') || v.startsWith('1860')) return v.replace(/^(1[89]\d{2})(\d{3})(\d+)$/, '$1-$2-$3');
  // Metro STD codes are 2 digits after the 0 (022 Mumbai, 011 Delhi, 033
  // Kolkata…); everywhere else the greedy 3-4 digit split reads best.
  if (/^0(11|20|22|33|40|44|79|80)\d{8}$/.test(v)) return v.replace(/^(0\d{2})(\d+)$/, '$1-$2');
  if (v.startsWith('0')) return v.replace(/^(0\d{2,4})(\d+)$/, '$1-$2');
  return v;
}
