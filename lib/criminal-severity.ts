// Which declared charges get the "serious" highlight, and why.
//
// NEUTRALITY RULES (see CLAUDE.md): we publish information, never verdicts.
// A charge is highlighted "serious" purely because its statute section is on
// the fixed list below - offence groups taken from the structure of the
// IPC/BNS themselves (offences affecting life, sexual offences, kidnapping,
// robbery/dacoity...) in line with ADR's published treatment of serious
// offences. The classification says what the section IS, never whether the
// person is guilty; a pending case remains an accusation.
//
// FAIL-SAFE DIRECTION: the list is deliberately under-inclusive. A section we
// have not mapped (or a statute we do not recognise) is simply not
// highlighted - the charge still displays verbatim. Being incomplete is
// acceptable; mislabelling is not. Never add a section here without checking
// the bare act text, and keep the IPC and BNS lists in sync.
import type { CriminalCharge, CriminalCase } from './types';

export type SeriousCategory = 'life' | 'women' | 'kidnap' | 'robbery' | 'enmity' | 'counterfeit' | 'organised';

// IPC 1860: base section token (digits + letter suffix, e.g. "304B") -> group.
const IPC: Record<string, SeriousCategory> = {
  // Offences affecting life (IPC ch. XVI)
  '302': 'life', '303': 'life', '304': 'life', '304B': 'life', '307': 'life', '308': 'life',
  // Sexual offences / offences against women
  '354': 'women', '354A': 'women', '354B': 'women', '354C': 'women', '354D': 'women',
  '366': 'women', '366A': 'women', '366B': 'women',
  '376': 'women', '376A': 'women', '376AB': 'women', '376B': 'women', '376C': 'women',
  '376D': 'women', '376DA': 'women', '376DB': 'women', '376E': 'women',
  '498A': 'women', '509': 'women',
  // Kidnapping / abduction
  '363': 'kidnap', '363A': 'kidnap', '364': 'kidnap', '364A': 'kidnap', '365': 'kidnap',
  '367': 'kidnap', '368': 'kidnap', '369': 'kidnap',
  // Extortion / robbery / dacoity
  '383': 'robbery', '384': 'robbery', '385': 'robbery', '386': 'robbery', '387': 'robbery',
  '388': 'robbery', '389': 'robbery', '392': 'robbery', '393': 'robbery', '394': 'robbery',
  '395': 'robbery', '396': 'life', '397': 'robbery', '398': 'robbery', '399': 'robbery',
  '400': 'robbery', '401': 'robbery', '402': 'robbery',
  // Promoting enmity / outraging religious feelings
  '153A': 'enmity', '153AA': 'enmity', '295A': 'enmity',
  // Counterfeiting currency
  '489A': 'counterfeit', '489B': 'counterfeit', '489C': 'counterfeit', '489D': 'counterfeit',
};

// BNS 2023: the same offence groups under the new code's numbering.
const BNS: Record<string, SeriousCategory> = {
  // Offences affecting life
  '103': 'life', '104': 'life', '105': 'life', '109': 'life', '110': 'life', '80': 'life',
  // Sexual offences / offences against women
  '64': 'women', '65': 'women', '66': 'women', '67': 'women', '68': 'women', '70': 'women',
  '71': 'women', '74': 'women', '75': 'women', '76': 'women', '77': 'women', '78': 'women',
  '79': 'women', '85': 'women', '87': 'women',
  // Kidnapping / abduction
  '137': 'kidnap', '138': 'kidnap', '139': 'kidnap', '140': 'kidnap',
  // Extortion / robbery / dacoity
  '308': 'robbery', '309': 'robbery', '310': 'robbery', '311': 'robbery', '312': 'robbery',
  // Promoting enmity / outraging religious feelings
  '196': 'enmity', '197': 'enmity', '299': 'enmity',
  // Counterfeiting currency
  '178': 'counterfeit', '179': 'counterfeit', '180': 'counterfeit',
  // Organised crime / terrorist act (new in BNS)
  '111': 'organised', '113': 'organised',
};

/** Special statutes whose very name defines the offence group. Matched against
 *  the affidavit's own "other acts" text; the DISPLAYED name is ours, so keep
 *  each canonical and unambiguous. */
const ACTS: { re: RegExp; name: string }[] = [
  { re: /prevention of corruption/i, name: 'Prevention of Corruption Act' },
  { re: /money[\s-]*laundering/i, name: 'Prevention of Money-Laundering Act' },
  { re: /unlawful activities|\buapa\b/i, name: 'Unlawful Activities (Prevention) Act' },
  { re: /\bndps\b|narcotic/i, name: 'NDPS Act' },
  { re: /arms act/i, name: 'Arms Act' },
  { re: /\bpocso\b|protection of children from sexual offences/i, name: 'POCSO Act' },
  // Affidavits write it "SC/ST Act", "S.C. S.T. Act", "SCST (POA) Act"...
  { re: /prevention of atrocities|s\.?\s*c\.?\s*[\/&.,-]?\s*s\.?\s*t\.?\s*(\(poa\))?\s*act/i, name: 'SC/ST (Prevention of Atrocities) Act' },
  { re: /explosive substances/i, name: 'Explosive Substances Act' },
];

/** "376(2)(n)" / "304-B" / " 498 A" -> the base token "376" / "304B" / "498A". */
function baseSection(token: string): string {
  const t = token.toUpperCase().replace(/[\s.\-]/g, '');
  const m = t.match(/^(\d+[A-Z]{0,2})/);
  return m ? m[1] : '';
}

/** The serious group for one section under one statute, or null. */
export function seriousCategory(law: string | undefined, sectionToken: string): SeriousCategory | null {
  const base = baseSection(sectionToken);
  if (!base) return null;
  const l = (law || '').toUpperCase();
  if (l === 'IPC') return IPC[base] ?? null;
  if (l === 'BNS') return BNS[base] ?? null;
  return null; // unknown statute - never highlight
}

/** Serious sections inside a verbatim cell like "302/34, 147, 341". Splits on
 *  commas, slashes and ampersands - affidavits write compounds ("302/34") that
 *  a comma-only split would hide. */
export function seriousSectionsInText(
  law: string | undefined,
  sectionsText: string | undefined,
): { section: string; category: SeriousCategory }[] {
  if (!sectionsText) return [];
  const out: { section: string; category: SeriousCategory }[] = [];
  const seen = new Set<string>();
  for (const token of sectionsText.split(/[,/&]/)) {
    const base = baseSection(token.trim());
    if (!base || seen.has(base)) continue;
    seen.add(base);
    const cat = seriousCategory(law, base);
    if (cat) out.push({ section: base, category: cat });
  }
  return out;
}

/** Named special statutes appearing in an affidavit's "other acts" text. */
export function seriousActsInText(text: string | undefined): string[] {
  if (!text) return [];
  return ACTS.filter((a) => a.re.test(text)).map((a) => a.name);
}

/** The serious group for one charge-summary entry, or null. */
export function chargeCategory(c: CriminalCharge): SeriousCategory | null {
  return seriousCategory(c.law, c.section);
}

/** Does this case row carry any highlighted section or statute? */
export function caseIsSerious(c: CriminalCase): boolean {
  return (
    seriousSectionsInText(c.law, c.sections).length > 0 ||
    seriousActsInText(c.other_sections).length > 0
  );
}

/** The exact criteria, exported so the methodology page can print them. */
export const SERIOUS_CRITERIA: { ipc: Record<string, SeriousCategory>; bns: Record<string, SeriousCategory>; acts: string[] } = {
  ipc: IPC,
  bns: BNS,
  acts: ACTS.map((a) => a.name),
};
