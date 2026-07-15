/**
 * Data-manager step: the OFFICIAL WEBSITE + contact page for every district.
 *
 * Why this exists: naming each District Magistrate / SP nationally is not
 * sustainable (there are ~600 districts and officers transfer constantly), so
 * most rungs of the escalation ladder have no incumbent. But a citizen does not
 * actually need the officer's *name* - they need a real, current PLACE to go.
 * Every district in India runs an official site (usually <slug>.nic.in) carrying
 * a "Who's Who" directory and a contact page with the collectorate's phone/email,
 * and those pages stay current as officers change. So we ship the durable
 * pointer instead of a name that rots.
 *
 * How a URL earns its place (never a guess - slug patterns are unreliable:
 * jaipur.nic.in and kanpur.nic.in do not exist, while dk.nic.in is Dakshina
 * Kannada). Two independent discovery routes, both then PROVEN by fetching:
 *   1. Wikidata: districts of India (P31/P279* Q1149652, P17 = India) with an
 *      official website (P856). ~712 of ~846 have one, and each is citable.
 *   2. Slug probe: a small set of candidate hosts derived from the district name,
 *      used only where Wikidata has no P856.
 * A candidate is ACCEPTED only if it responds 200 AND the page identifies itself
 * as that district (title/body mentions the district name, or an Indic-script
 * page carries a district-site marker). Everything else is dropped - a dead or
 * mismatched link in an accountability ladder is worse than no link.
 *
 * We additionally look for the site's "Who's Who" / contact / grievance page and
 * any collectorate phone/email printed on it, since that is what the citizen
 * actually dials.
 *
 * Output: data/seed/district_portals.json, keyed by `${stateCode}__${district}`,
 * every record carrying source_url/source_name/retrieved_date.
 *
 * Usage:  npm run dm -- discover-district-portals
 *         DP_LIMIT=20 npm run dm -- discover-district-portals
 *         DP_ONLY=KA npm run dm -- discover-district-portals
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const OUT = resolve(ROOT, 'data', 'seed', 'district_portals.json');
const UA = 'Mozilla/5.0 (compatible; RankYourPolitician/1.0; +https://rankyourpolitician.com; civic info)';
const TODAY = new Date().toISOString().slice(0, 10);
const LIMIT = process.env.DP_LIMIT ? parseInt(process.env.DP_LIMIT, 10) : Infinity;
const ONLY = process.env.DP_ONLY || '';

export interface DistrictPortal {
  key: string;                 // `${stateCode}__${district}`
  stateCode: string;
  district: string;
  url: string;                 // verified-live district homepage
  title?: string;
  whosWhoUrl?: string;         // officer directory (names + phones, kept current by the district)
  contactUrl?: string;         // "Contact us" / grievance page
  phone?: string;              // collectorate/control-room number printed on the site
  email?: string;
  source_url: string;          // where the URL itself came from (Wikidata item, or the site)
  source_name: string;
  retrieved_date: string;
  verified: 'fetched-200-name-match' | 'fetched-200-marker';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normalise a district name for comparison: drop "district", punctuation, case. */
const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bdistrict\b/g, ' ').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s: string) => norm(s).replace(/ /g, '');

/** Edit distance - used only for same-state near-miss district spellings. */
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

// 9s: government sites are slow but a host that has not answered by then is
// almost always dead, and misses dominate this run's wall-clock.
//
// One retry on a transient failure (timeout / reset / 5xx): district portals
// flake constantly - jorhat.assam.gov.in answers 503 one minute and 200 the
// next - and a single probe silently under-reports live sites. DNS-level misses
// (the host genuinely does not exist) fail fast and are not retried.
async function fetchOnce(u: string, ms: number): Promise<{ status: number; html: string; url: string } | null> {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(u, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
    clearTimeout(to);
    const html = r.ok ? await r.text() : '';
    return { status: r.status, html, url: r.url || u };
  } catch {
    return null;
  }
}

async function fetchText(u: string, ms = 9000): Promise<{ status: number; html: string; url: string } | null> {
  const first = await fetchOnce(u, ms);
  if (first && first.status === 200) return first;
  // Retry only when the host answered badly or timed out - i.e. it may be real.
  const transient = first === null || first.status >= 500 || first.status === 429;
  if (!transient) return first;
  await sleep(1200);
  return (await fetchOnce(u, ms + 4000)) ?? first;
}

const titleOf = (html: string) => ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();

/**
 * A district site must prove it is THAT district. Name match is the strong signal;
 * many sites render only in the state language, so a generic district-site marker
 * (NIC district-portal furniture) is accepted as a weaker fallback.
 */
function identify(
  district: string,
  stateName: string,
  html: string,
  host: string,
  requireState: boolean,
): DistrictPortal['verified'] | null {
  const t = titleOf(html);
  const hay = norm(t + ' ' + html.slice(0, 60000));
  const d = norm(district);
  const dc = compact(district);
  if (!d) return null;

  // Slug-probed hosts are unscoped: hamirpur.nic.in could be UP's Hamirpur when we
  // want Himachal's. Make such a page prove its state before we accept it - but
  // ONLY when the district name is actually ambiguous (see AMBIGUOUS), because
  // most district sites render solely in the state language and carry no Latin
  // state name at all (mysore.nic.in is Kannada-only), so demanding one would
  // reject a correct, unambiguous match. Wikidata candidates are already
  // state-scoped by the SPARQL and skip this entirely.
  //
  // Matched on TOKENS, not the full string: sites routinely shorten the official
  // name ("Government of Andaman and Nicobar" for "Andaman & Nicobar Islands"),
  // so an exact-substring test rejects genuine matches. Requiring ~60% of the
  // distinctive tokens still separates the lookalikes that matter - "Uttar
  // Pradesh" and "Himachal Pradesh" share only `pradesh`, and both 2-token names
  // need BOTH tokens to pass.
  if (requireState && stateName) {
    const stopwords = new Set(['and', 'of', 'the']);
    const want = norm(stateName).split(' ').filter((w) => w && !stopwords.has(w));
    if (want.length) {
      const need = Math.max(1, Math.ceil(want.length * 0.6));
      const got = want.filter((w) => hay.includes(w)).length;
      if (got < need) return null;
    }
  }

  // Name in title/body, or the compacted name in the hostname (dk.nic.in is too
  // short to match this way, which is why the marker fallback exists).
  if (hay.includes(d) || (dc.length >= 4 && compact(host).includes(dc))) return 'fetched-200-name-match';
  // Indic-only page: accept NIC district-portal markers + a Government-of-India tell.
  const marker = /(who'?s\s*who|whos-who|district administration|jila|zilla|collectorate|district magistrate)/i.test(html);
  const govTell = /(\.nic\.in|\.gov\.in|Government of|National Informatics Centre|S3WaaS|india\.gov\.in)/i.test(html);
  if (marker && govTell) return 'fetched-200-marker';
  return null;
}

/** Absolute-ise a possibly-relative href against the page URL. */
function abs(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

/** Find the Who's Who / contact / grievance links on a district homepage. */
function findSubPages(html: string, base: string): { whosWhoUrl?: string; contactUrl?: string } {
  const out: { whosWhoUrl?: string; contactUrl?: string } = {};
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const both = (text + ' ' + href).toLowerCase();
    if (!out.whosWhoUrl && /who'?s[\s-]*who|whos-who|officer.*directory|district.*officials/.test(both)) {
      const a = abs(href, base); if (a) out.whosWhoUrl = a;
    }
    if (!out.contactUrl && /contact[\s-]*(us)?|grievance|helpline|public.*relation/.test(both)) {
      const a = abs(href, base); if (a) out.contactUrl = a;
    }
    if (out.whosWhoUrl && out.contactUrl) break;
  }
  return out;
}

/**
 * Pull the district office's own landline and official email off a page.
 *
 * Deliberately NOT toll-free: 1800 numbers on a district site are almost always
 * a national scheme helpline sitting in the page furniture (1800111555, the LPG
 * emergency line, appears in dozens of district footers), and presenting one as
 * "the district office" would be simply false. A district-specific STD landline
 * is the only shape we accept here; genuine national helplines are carried
 * separately, sourced and labelled as such, in contact_channels.json.
 */
function findContacts(html: string): { phone?: string; email?: string } {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ');
  const out: { phone?: string; email?: string } = {};
  // Official mailboxes only: gov.in / nic.in. Anything else is not the collectorate.
  const em = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*\b(?:nic|gov)\.in\b/);
  if (em) out.email = em[0].toLowerCase();
  // STD landline: leading 0, 10-11 digits overall (e.g. 08554275706, 03193265220).
  const ph = text.match(/\b0\d{2,4}[-\s]?\d{6,8}\b/);
  if (ph) {
    const digits = ph[0].replace(/[^\d]/g, '');
    if (digits.length >= 10 && digits.length <= 11) out.phone = digits;
  }
  return out;
}

/**
 * Drop any phone that shows up for several different districts. A collectorate
 * number is by definition local to one district, so a number repeated across
 * many is page furniture (a state/national helpline in a shared footer template)
 * that we would otherwise mislabel as "the district office".
 */
function stripSharedPhones(out: Record<string, DistrictPortal>): number {
  let dropped = 0;
  // Re-validate every stored number, not just ones scraped this run: entries
  // resolved by an earlier run are skipped above, so this is the only place a
  // previously-accepted bad number gets caught.
  const isLocalLandline = (v: string) => /^0\d{9,10}$/.test(v);
  for (const p of Object.values(out)) {
    if (p.phone && !isLocalLandline(p.phone)) { delete p.phone; dropped++; }
  }
  const count = new Map<string, number>();
  for (const p of Object.values(out)) if (p.phone) count.set(p.phone, (count.get(p.phone) || 0) + 1);
  for (const p of Object.values(out)) {
    if (p.phone && (count.get(p.phone) || 0) > 2) {
      delete p.phone;
      dropped++;
    }
  }
  return dropped;
}

/** stateCode -> state name, learned from the seed (filled by ourDistricts). */
const STATE_NAME: Record<string, string> = {};

/**
 * Compacted district names that exist in more than one state, so a slug-probed
 * host could belong to the wrong one (Aurangabad: BR+MH, Hamirpur: UP+HP,
 * Bilaspur: CG+HP, Pratapgarh: UP+RJ). Only these need the page to prove its
 * state; for a nationally-unique name there is nothing to confuse it with.
 * Built from our own district list AND Wikidata's, so a name that collides only
 * in Wikidata's wider set is still treated as ambiguous.
 */
const AMBIGUOUS = new Set<string>();
function buildAmbiguous(ours: { stateCode: string; district: string }[], wd: { label: string; stateCode: string }[]) {
  const states = new Map<string, Set<string>>();
  const note = (name: string, sc: string) => {
    const k = compact(name);
    if (!k || !sc) return;
    if (!states.has(k)) states.set(k, new Set());
    states.get(k)!.add(sc);
  };
  for (const d of ours) note(d.district, d.stateCode);
  for (const w of wd) note(w.label, w.stateCode);
  for (const [k, set] of states) if (set.size > 1) AMBIGUOUS.add(k);
}

/** Districts we actually serve, from the seed's politician->districts mapping. */
function ourDistricts(): { stateCode: string; district: string }[] {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  const set = new Map<string, { stateCode: string; district: string }>();
  for (const p of pols) {
    if (p.stateCode && p.state) STATE_NAME[p.stateCode] = p.state;
    for (const d of p.districts || []) {
      if (!d || !p.stateCode) continue;
      const key = `${p.stateCode}__${d}`;
      if (!set.has(key)) set.set(key, { stateCode: p.stateCode, district: d });
    }
  }
  return [...set.values()].sort((a, b) => (a.stateCode + a.district).localeCompare(b.stateCode + b.district));
}

/**
 * Wikidata state label -> our stateCode. Needed because district names are NOT
 * unique across India: Aurangabad (BR/MH), Hamirpur (UP/HP), Bilaspur (CG/HP)
 * and Pratapgarh (UP/RJ) all collide, so a name-only match could hand a citizen
 * the wrong state's collectorate. Every lookup is scoped by state.
 */
const WD_STATE_CODE: Record<string, string> = {
  'andaman and nicobar islands': 'AN', 'andhra pradesh': 'AP', 'arunachal pradesh': 'AR',
  assam: 'AS', bihar: 'BR', chandigarh: 'CH', chhattisgarh: 'CG',
  'dadra and nagar haveli and daman and diu': 'DN', delhi: 'DL', 'national capital territory of delhi': 'DL',
  goa: 'GA', gujarat: 'GJ', haryana: 'HR', 'himachal pradesh': 'HP',
  'jammu and kashmir': 'JK', jharkhand: 'JH', karnataka: 'KA', kerala: 'KL',
  ladakh: 'LA', lakshadweep: 'LD', 'madhya pradesh': 'MP', maharashtra: 'MH',
  manipur: 'MN', meghalaya: 'ML', mizoram: 'MZ', nagaland: 'NL', odisha: 'OD',
  puducherry: 'PY', punjab: 'PB', rajasthan: 'RJ', sikkim: 'SK', 'tamil nadu': 'TN',
  telangana: 'TG', tripura: 'TR', 'uttar pradesh': 'UP', uttarakhand: 'UK',
  'west bengal': 'WB',
};

/**
 * Districts renamed/aliased since our seed's naming. Keys are `${stateCode}|${compacted seed name}`.
 * Sourced from the states' own renaming notifications as reflected on Wikidata.
 */
const DISTRICT_ALIAS: Record<string, string> = {
  'AP|anantapur': 'anantapuramu',
  'AP|cuddapah': 'ysr',              // Cuddapah -> YSR (Kadapa) district
  'AP|kadapa': 'ysr',
  'OD|keonjhar': 'kendujhar',
  'OD|balasore': 'baleswar',
  'WB|hooghly': 'hugli',
  'TN|thoothukudi': 'tuticorin',
  'KL|palakkad': 'palakkad',
  'UP|allahabad': 'prayagraj',
  'UP|faizabad': 'ayodhya',
  'MH|aurangabad': 'chhatrapatisambhajinagar',
  'MH|osmanabad': 'dharashiv',
};

/** Wikidata: every Indian district that publishes an official website, with its state. */
async function wikidataSites(): Promise<{ label: string; site: string; qid: string; stateCode: string }[]> {
  // P131+ walks the containment chain (district -> division -> state), since many
  // districts sit under a division rather than directly under the state.
  const q = `
SELECT ?d ?dLabel ?stateLabel ?site WHERE {
  ?d wdt:P31/wdt:P279* wd:Q1149652 .
  ?d wdt:P17 wd:Q668 .
  ?d wdt:P856 ?site .
  OPTIONAL {
    ?d wdt:P131+ ?state .
    ?state wdt:P31/wdt:P279* ?sType .
    VALUES ?sType { wd:Q12443800 wd:Q1352230 }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
  const u = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
      if (r.ok) {
        const j = await r.json();
        return j.results.bindings.map((b: any) => ({
          label: b.dLabel?.value || '',
          site: b.site?.value || '',
          qid: (b.d?.value || '').split('/').pop() || '',
          stateCode: WD_STATE_CODE[norm(b.stateLabel?.value || '')] || '',
        })).filter((x: any) => x.label && x.site);
      }
    } catch { /* retry */ }
    await sleep(1500 * (a + 1));
  }
  console.warn('Wikidata SPARQL failed - falling back to slug probes only.');
  return [];
}

/**
 * Domain suffixes each state actually uses for its district sites, confirmed by
 * probing live hosts rather than assumed: Assam is `<slug>.assam.gov.in`
 * (kamrup.assam.gov.in), Bihar `<slug>.bih.nic.in`, Andhra `<slug>.ap.gov.in`.
 * Guessing these wrong is the single biggest source of misses.
 */
const STATE_SUFFIX: Record<string, string[]> = {
  AS: ['assam.gov.in'],
  BR: ['bih.nic.in'],
  AP: ['ap.gov.in'],
  AN: ['andaman.nic.in'],
  HP: ['hp.gov.in'],
  MH: ['maharashtra.gov.in'],
  TG: ['telangana.gov.in'],
  KL: ['kerala.gov.in'],
  JK: ['jk.gov.in'],
  UK: ['uk.gov.in'],
  PY: ['py.gov.in'],
  SK: ['sikkim.gov.in'],
  ML: ['meghalaya.gov.in'],
  MN: ['manipur.gov.in'],
  MZ: ['mizoram.gov.in'],
  NL: ['nagaland.gov.in'],
  TR: ['tripura.gov.in'],
  AR: ['arunachal.gov.in'],
  RJ: ['rajasthan.gov.in'],
  WB: ['wb.gov.in'],
  MP: ['mp.gov.in'],
  UP: ['up.nic.in'],
  GJ: ['gujarat.gov.in'],
  HR: ['haryana.gov.in'],
  PB: ['punjab.gov.in'],
  OD: ['odisha.gov.in'],
  JH: ['jharkhand.gov.in'],
  CG: ['cg.gov.in'],
  KA: ['karnataka.gov.in'],
  TN: ['tn.gov.in'],
  GA: ['goa.gov.in'],
};

/** Candidate hosts for a district with no Wikidata site. */
function slugCandidates(district: string, stateCode: string): string[] {
  const base = compact(district);
  if (!base || base.length < 3) return [];
  const words = norm(district).split(' ').filter(Boolean);
  const first = words[0] || base;
  const out = new Set<string>();
  for (const s of [base, first]) {
    if (s.length < 3) continue;
    out.add(`https://${s}.nic.in`);
    out.add(`https://${s}.gov.in`);
    for (const suf of STATE_SUFFIX[stateCode] ?? []) out.add(`https://${s}.${suf}`);
  }
  return [...out].slice(0, 8);
}

async function main() {
  const allDistricts = ourDistricts();
  const districts = allDistricts.filter((d) => !ONLY || d.stateCode === ONLY);
  const work = LIMIT === Infinity ? districts : districts.slice(0, LIMIT);
  console.log(`Districts to resolve: ${work.length}${ONLY ? ` (state ${ONLY})` : ''}`);

  console.log('Querying Wikidata for official district websites…');
  const wd = await wikidataSites();
  console.log(`Wikidata: ${wd.length} districts publish an official website (${wd.filter((w) => w.stateCode).length} with a resolved state)`);

  // Ambiguity is a national property: compute it from EVERY district we know,
  // never the DP_ONLY subset, or a single-state run would think each name unique.
  buildAmbiguous(allDistricts, wd);
  console.log(`District names shared by >1 state (these must prove their state): ${AMBIGUOUS.size}`);

  // Primary index is STATE-SCOPED (`ST|name`) so colliding district names across
  // states can never cross-link. `nameOnly` is a fallback for the ~40 Wikidata
  // items whose state did not resolve, and is used ONLY when the name is
  // unambiguous nationally.
  const wdByStateName = new Map<string, { site: string; qid: string }>();
  const nameCount = new Map<string, number>();
  const nameOnly = new Map<string, { site: string; qid: string }>();
  for (const w of wd) {
    const nm = compact(w.label);
    if (!nm) continue;
    nameCount.set(nm, (nameCount.get(nm) || 0) + 1);
    if (!nameOnly.has(nm)) nameOnly.set(nm, { site: w.site, qid: w.qid });
    if (w.stateCode) {
      const k = `${w.stateCode}|${nm}`;
      if (!wdByStateName.has(k)) wdByStateName.set(k, { site: w.site, qid: w.qid });
    }
  }

  /** Wikidata site for a district, scoped to its state; alias- and fuzzy-tolerant. */
  const lookupWd = (stateCode: string, district: string): { site: string; qid: string } | undefined => {
    const nm = compact(district);
    const alias = DISTRICT_ALIAS[`${stateCode}|${nm}`];
    for (const cand of [nm, alias].filter(Boolean) as string[]) {
      const exact = wdByStateName.get(`${stateCode}|${cand}`);
      if (exact) return exact;
    }
    // Fuzzy, but ONLY within the same state, and only if exactly one candidate
    // is close enough - otherwise we would be guessing.
    const near: { site: string; qid: string }[] = [];
    for (const [k, v] of wdByStateName) {
      const [sc, n] = k.split('|');
      if (sc !== stateCode) continue;
      if (Math.abs(n.length - nm.length) > 3) continue;
      if (lev(n, nm) <= 2) near.push(v);
    }
    if (near.length === 1) return near[0];
    // Last resort: a nationally-unique name whose Wikidata state did not resolve.
    if (nameCount.get(nm) === 1 && !wdByStateName.has(`${stateCode}|${nm}`)) {
      const only = nameOnly.get(nm);
      // Only safe if no OTHER state already claims this name.
      let claimedElsewhere = false;
      for (const k of wdByStateName.keys()) if (k.endsWith(`|${nm}`) && !k.startsWith(`${stateCode}|`)) claimedElsewhere = true;
      if (only && !claimedElsewhere) return only;
    }
    return undefined;
  };

  // Keep any previously-resolved portals so a partial run never loses ground.
  const prev: Record<string, DistrictPortal> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const out: Record<string, DistrictPortal> = { ...prev };

  let ok = 0, fail = 0, n = 0;
  const failed: string[] = [];

  /** Resolve ONE district: try each candidate URL until one proves itself. */
  async function resolveOne(stateCode: string, district: string): Promise<DistrictPortal | null> {
    const key = `${stateCode}__${district}`;
    // Candidate URLs: Wikidata's P856 first (citable), then slug probes.
    const cands: { url: string; src: 'wikidata' | 'probe'; qid?: string }[] = [];
    const w = lookupWd(stateCode, district);
    if (w) cands.push({ url: w.site.replace(/^http:/, 'https:'), src: 'wikidata', qid: w.qid });
    if (w && /^http:/.test(w.site)) cands.push({ url: w.site, src: 'wikidata', qid: w.qid }); // some sites are http-only
    for (const c of slugCandidates(district, stateCode)) cands.push({ url: c, src: 'probe' });

    for (const c of cands) {
      const res = await fetchText(c.url);
      if (!res || res.status !== 200 || !res.html) continue;
      const needState = c.src === 'probe' && AMBIGUOUS.has(compact(district));
      const verified = identify(district, STATE_NAME[stateCode] || '', res.html, res.url, needState);
      if (!verified) continue;

      const subs = findSubPages(res.html, res.url);
      let phone: string | undefined, email: string | undefined;
      // Prefer contacts printed on the Who's Who / contact page over the homepage.
      const detailUrl = subs.whosWhoUrl || subs.contactUrl;
      if (detailUrl) {
        const dres = await fetchText(detailUrl);
        if (dres && dres.status === 200) ({ phone, email } = findContacts(dres.html));
      }
      if (!phone && !email) ({ phone, email } = findContacts(res.html));

      return {
        key, stateCode, district,
        url: res.url.replace(/\/$/, ''),
        title: titleOf(res.html).slice(0, 120) || undefined,
        whosWhoUrl: subs.whosWhoUrl,
        contactUrl: subs.contactUrl,
        phone, email,
        source_url: c.src === 'wikidata' ? `https://www.wikidata.org/wiki/${c.qid}` : res.url,
        source_name: c.src === 'wikidata'
          ? 'Wikidata (official website, P856) - verified live'
          : 'Official district portal - verified live',
        retrieved_date: TODAY,
        verified,
      };
    }
    return null;
  }

  // Districts are independent, and most of the wall-clock is spent waiting on
  // dead hosts (a miss burns several connect timeouts in series). A small worker
  // pool cuts the run from hours to minutes; CONC stays modest to keep the load
  // on government servers polite.
  const CONC = parseInt(process.env.DP_CONC || '8', 10);
  const queue = work.filter(({ stateCode, district }) => {
    const key = `${stateCode}__${district}`;
    if (out[key]) { ok++; return false; } // already resolved on an earlier run
    return true;
  });
  console.log(`Already resolved: ${ok} · to fetch now: ${queue.length} · concurrency ${CONC}`);

  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= queue.length) return;
      const { stateCode, district } = queue[i];
      const key = `${stateCode}__${district}`;
      let hit: DistrictPortal | null = null;
      try {
        hit = await resolveOne(stateCode, district);
      } catch {
        hit = null; // a single bad host must never abort the whole run
      }
      if (hit) { out[key] = hit; ok++; } else { fail++; failed.push(key); }
      if (++n % 20 === 0) {
        console.log(`  ${n}/${queue.length} fetched · resolved ${ok} · unresolved ${fail}`);
        writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); // checkpoint
      }
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, worker));

  // Global pass: only possible once every district is in hand.
  const sharedDropped = stripSharedPhones(out);
  if (sharedDropped) console.log(`  dropped ${sharedDropped} shared/footer phone number(s) - not district-specific`);

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  const withWho = Object.values(out).filter((p) => p.whosWhoUrl).length;
  const withPhone = Object.values(out).filter((p) => p.phone).length;
  const withEmail = Object.values(out).filter((p) => p.email).length;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✓ district portals: ${ok}/${work.length} resolved (${fail} unresolved)`);
  console.log(`  with Who's Who page: ${withWho} · phone: ${withPhone} · email: ${withEmail}`);
  if (failed.length) console.log(`  unresolved: ${failed.slice(0, 25).join(', ')}${failed.length > 25 ? ` …+${failed.length - 25}` : ''}`);
  console.log(`  → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
