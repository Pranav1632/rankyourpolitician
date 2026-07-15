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
 * Channels to show for a problem, state-specific before national (a citizen's
 * own state helpline is the more actionable one), deduped by value, capped so
 * the ladder stays glanceable.
 */
export function channelsForProblem(
  all: ContactChannel[],
  problem: ProblemType,
  limit = 4,
): ContactChannel[] {
  const topics = PROBLEM_TOPICS[problem] || ['grievance'];
  const rank = (c: ContactChannel) => {
    const ti = topics.indexOf(c.topic);
    if (ti === -1) return 999;
    // Same topic: state channel first, then national. Phones before portals -
    // a number is the faster lever when something is actually broken.
    return ti * 10 + (c.scope === 'state' ? 0 : 2) + (c.kind === 'phone' ? 0 : 1);
  };
  const seen = new Set<string>();
  return all
    .filter((c) => topics.includes(c.topic))
    .sort((a, b) => rank(a) - rank(b))
    .filter((c) => {
      const k = `${c.kind}:${c.value}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

/** The single most useful channel for a problem (used in tight/compact spots). */
export function primaryChannel(all: ContactChannel[], problem: ProblemType): ContactChannel | undefined {
  return channelsForProblem(all, problem, 1)[0];
}

/**
 * The best number to CALL for a problem, or undefined if only portals exist.
 * Callers that render a dial button need this rather than primaryChannel, which
 * may legitimately return a URL.
 */
export function primaryPhone(all: ContactChannel[], problem: ProblemType): ContactChannel | undefined {
  return channelsForProblem(all.filter((c) => c.kind === 'phone'), problem, 1)[0];
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
): boolean {
  return (
    !!portal?.url ||
    !!districtDirectory(channels) ||
    channelsForProblem(channels ?? [], problem, 1).length > 0
  );
}

/** tel: href - Indian short codes (112, 1098) must not be prefixed with +91. */
export function telHref(value: string): string {
  const v = value.replace(/[^\d]/g, '');
  if (v.length <= 5) return `tel:${v}`;           // short code, dial as-is
  if (v.startsWith('0') || v.startsWith('1800')) return `tel:${v}`; // STD / toll-free
  return `tel:+91${v}`;
}

/** Display form: group digits so a long number stays readable. */
export function formatPhone(value: string): string {
  const v = value.replace(/[^\d]/g, '');
  if (v.length <= 5) return v;
  if (v.startsWith('1800')) return v.replace(/^(1800)(\d{3,4})(\d+)$/, '$1-$2-$3');
  if (v.startsWith('0')) return v.replace(/^(0\d{2,4})(\d+)$/, '$1-$2');
  return v;
}
