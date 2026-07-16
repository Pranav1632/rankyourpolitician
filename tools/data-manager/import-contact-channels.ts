/**
 * Data-manager step: turn the contact-channels research workflow's output into
 * data/seed/contact_channels.json.
 *
 * The workflow (see the `ryp-contact-channels` script) researches each state's
 * CM helpline / grievance portal / police portal and the national helplines,
 * then has every single value adversarially re-checked against the official page
 * that publishes it; only CONFIRMED values reach this importer. This step is the
 * last gate before the data ships:
 *   - drops anything without an official-looking source (a helpline sourced to a
 *     blog is not a helpline we will print)
 *   - normalises phone values to digits and sanity-checks them as real Indian
 *     numbers (short code / STD landline / 1800 toll-free)
 *   - maps the workflow's state codes onto the seed's (the seed uses CG/OD/UK
 *     where the workflow used CT/OR/UT), matching on state NAME so a code
 *     mismatch can never silently drop a state
 *   - de-duplicates, and drops state entries that merely repeat a national number
 *
 * Usage:  npm run dm -- import-contact-channels <workflow-output.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { ContactChannel, ContactChannelsFile, ContactTopic } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const OUT = resolve(ROOT, 'data', 'seed', 'contact_channels.json');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const TODAY = new Date().toISOString().slice(0, 10);

const VALID_TOPICS = new Set<string>([
  'emergency', 'police', 'women', 'child', 'health', 'ambulance', 'electricity',
  'water', 'ration', 'senior', 'grievance', 'corruption', 'general', 'cyber',
  'road', 'fire', 'disaster',
]);

/** Official publishers only. A number is a claim; it needs a government source. */
const OFFICIAL_HOST = /(^|\.)(gov\.in|nic\.in)$/i;

/**
 * Bodies that are the authoritative publisher of their own service but do not
 * sit on a .gov.in domain. Almost all are state electricity distribution
 * companies (DISCOMs) - state-owned utilities that publish their consumer
 * complaint numbers on their own sites; a power-cut helpline exists nowhere
 * else, so a .gov.in-only rule would silently drop one of the things citizens
 * most need. Each host here is the operator of the service it publishes, and
 * each individual value was still adversarially verified against the page.
 * Keep this list explicit: a domain earns a place only by being the operator.
 */
const OFFICIAL_UTILITY_HOSTS = new Set([
  // State electricity distribution companies
  'www.apspdcl.in', 'apspdcl.in',                       // Andhra Pradesh Southern Power
  'www.apeasternpower.com', 'apeasternpower.com',       // Andhra Pradesh Eastern Power
  'www.apdcl.org', 'apdcl.org',                         // Assam Power Distribution
  'ccrs.bsphcl.co.in', 'bsphcl.co.in',                  // Bihar State Power Holding
  'www.cspdcl.co.in', 'cspdcl.co.in',                   // Chhattisgarh State Power
  'www.uhbvn.org.in', 'uhbvn.org.in',                   // Uttar Haryana Bijli Vitran
  'www.dhbvn.org.in', 'dhbvn.org.in',                   // Dakshin Haryana Bijli Vitran
  'www.hpseb.in', 'hpseb.in',                           // Himachal Pradesh State Electricity Board
  'jbvnl.co.in', 'www.jbvnl.co.in',                     // Jharkhand Bijli Vitran Nigam
  'kseb.in', 'www.kseb.in',                             // Kerala State Electricity Board
  'www.mahadiscom.in', 'mahadiscom.in',                 // Maharashtra State Electricity Distribution
  'mspdcl.in', 'www.mspdcl.in',                         // Manipur State Power Distribution
  'www.pspcl.in', 'pspcl.in',                           // Punjab State Power Corporation
  'tgnpdcl.com', 'www.tgnpdcl.com',                     // Telangana Northern Power Distribution
  'tgsouthernpower.org', 'www.tgsouthernpower.org',     // Telangana Southern Power Distribution
  'www.wbsedcl.in', 'wbsedcl.in',                       // West Bengal State Electricity Distribution
  'www.tpnodl.com', 'tpnodl.com',                       // TP Northern Odisha Distribution (licensee)
  'tsecl.in', 'www.tsecl.in',                           // Tripura State Electricity Corporation
  'dnhddpcl.in', 'www.dnhddpcl.in',                     // DNH & DD Power Corporation
  'chandigarhpower.com', 'www.chandigarhpower.com',     // Chandigarh distribution licensee
  // Private/city distribution licensees - each is the operator of the licence
  // area its label names (Kolkata, Mumbai, Delhi, Ahmedabad/Surat/Agra, Greater
  // Noida). State discoms don't serve these areas, so these hosts are the ONLY
  // official publishers of the numbers their consumers need.
  'cesc.co.in', 'www.cesc.co.in',                       // CESC Ltd - Kolkata & Howrah
  'bestundertaking.com', 'www.bestundertaking.com',     // BEST - Mumbai island city
  'adanielectricity.com', 'www.adanielectricity.com',   // Adani Electricity - Mumbai suburbs
  'tatapower.com', 'www.tatapower.com',                 // Tata Power - Mumbai licence area
  'bsesdelhi.com', 'www.bsesdelhi.com',                 // BSES Rajdhani + Yamuna - Delhi
  'tatapower-ddl.com', 'www.tatapower-ddl.com',         // Tata Power-DDL - north Delhi
  'torrentpower.com', 'www.torrentpower.com',           // Torrent - Ahmedabad/Surat/Agra/DNH-DD
  'noidapower.com', 'www.noidapower.com',               // NPCL - Greater Noida
  // State discom hosts added with the July 2026 multi-discom coverage pass
  'apcpdcl.in', 'www.apcpdcl.in',                       // AP Central Power Distribution
  'consolidatedbill.mpez.co.in', 'www.mpez.co.in',      // MP Poorv Kshetra (Jabalpur)
  'mpwz.co.in', 'www.mpwz.co.in',                       // MP Paschim Kshetra (Indore)
  'bijlimitra.com', 'www.bijlimitra.com',               // JVVNL consumer portal (Jaipur discom)
  // Other state agencies that operate the service they publish
  'hr.erss.in',                                         // Haryana Emergency Response Support System
  'www.ocac.in', 'ocac.in',                             // Odisha Computer Application Centre (Sanjog)
  'kswdc.org', 'www.kswdc.org',                         // Kerala State Women's Development Corporation
  'cmhelpline.tnega.org',                               // Tamil Nadu e-Governance Agency (CM Helpline)
]);

function isOfficialSource(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return OFFICIAL_HOST.test(h) || OFFICIAL_UTILITY_HOSTS.has(h);
  } catch {
    return false;
  }
}

/**
 * Is this a plausible Indian public-service number?
 *   - 3-6 digit short code (112, 1098, 14567, and the 6-digit 155xxx series
 *     several states use for citizen call centres)
 *   - 1800/1860 toll-free
 *   - STD landline starting 0, 8-12 digits
 *   - 10-digit mobile starting 6-9
 * Anything else (a truncated number, a foreign format) is dropped rather than
 * printed for someone to dial in an emergency.
 */
function normalisePhone(raw: string): string | null {
  const v = (raw || '').replace(/[^\d]/g, '');
  if (!v) return null;
  if (v.length >= 3 && v.length <= 6) return v;
  if (/^1(800|860)\d{6,8}$/.test(v)) return v;
  if (/^0\d{7,11}$/.test(v)) return v;
  if (/^[6-9]\d{9}$/.test(v)) return v;
  if (/^91[6-9]\d{9}$/.test(v)) return v.slice(2);
  return null;
}

function normaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Plausible published contact address - anything else is dropped, not "fixed". */
function normaliseEmail(raw: string): string | null {
  const v = (raw || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(v) ? v : null;
}

/** District names actually present in the seed, per state - the only names the
 * `districts` service-area field may use (a misspelt tag silently hides a
 * helpline from the district it was meant for). */
function seedDistricts(): Map<string, Set<string>> {
  const pols = JSON.parse(readFileSync(SEED, 'utf8')) as { stateCode?: string; districts?: string[] }[];
  const m = new Map<string, Set<string>>();
  for (const p of pols) {
    if (!p.stateCode || p.stateCode === 'NOM') continue;
    let set = m.get(p.stateCode);
    if (!set) m.set(p.stateCode, (set = new Set()));
    for (const d of p.districts ?? []) set.add(d);
  }
  return m;
}

/** stateCode -> state name, straight from the seed (the naming we must match). */
function seedStates(): Map<string, string> {
  const pols = JSON.parse(readFileSync(SEED, 'utf8')) as { stateCode?: string; state?: string }[];
  const m = new Map<string, string>();
  for (const p of pols) if (p.stateCode && p.state && p.stateCode !== 'NOM') m.set(p.stateCode, p.state);
  return m;
}

const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

interface RawChannel {
  kind?: string; topic?: string; label?: string; value?: string;
  operator?: string; districts?: string[];
  source_url?: string; source_name?: string; note?: string; retrieved_date?: string;
}

function clean(
  raw: RawChannel[],
  scope: 'national' | 'state',
  where: string,
  drops: string[],
  knownDistricts?: Set<string>,
): ContactChannel[] {
  const out: ContactChannel[] = [];
  const seen = new Set<string>();
  for (const c of raw || []) {
    const label = (c.label || '').trim();
    const src = (c.source_url || '').trim();
    if (!label || !src) { drops.push(`${where}: "${label || '?'}" - missing label/source`); continue; }
    if (!isOfficialSource(src)) { drops.push(`${where}: "${label}" - source not an official .gov.in/.nic.in page (${src})`); continue; }
    const topic = (c.topic || 'general').trim() as ContactTopic;
    if (!VALID_TOPICS.has(topic)) { drops.push(`${where}: "${label}" - unknown topic "${c.topic}"`); continue; }

    let value: string | null;
    const kind = c.kind === 'url' ? 'url' : c.kind === 'email' ? 'email' : 'phone';
    if (kind === 'phone') {
      value = normalisePhone(c.value || '');
      if (!value) { drops.push(`${where}: "${label}" - implausible phone ${JSON.stringify(c.value)}`); continue; }
    } else if (kind === 'email') {
      value = normaliseEmail(c.value || '');
      if (!value) { drops.push(`${where}: "${label}" - bad email ${JSON.stringify(c.value)}`); continue; }
    } else {
      value = normaliseUrl(c.value || '');
      if (!value) { drops.push(`${where}: "${label}" - bad url ${JSON.stringify(c.value)}`); continue; }
    }

    // Service-area tags must use the seed's district spellings exactly - a tag
    // the district pages can't match HIDES the channel where it should show, so
    // an unknown name drops the whole tag list (channel stays, shown state-wide).
    let districts: string[] | undefined;
    if (Array.isArray(c.districts) && c.districts.length) {
      const bad = knownDistricts ? c.districts.filter((d) => !knownDistricts.has(d)) : c.districts;
      if (bad.length) {
        drops.push(`${where}: "${label}" - unknown district tag(s) ${bad.join(', ')} (tags removed, channel kept)`);
      } else {
        districts = [...new Set(c.districts)].sort();
      }
    }

    const k = `${kind}:${value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const operator = (c.operator || '').trim();
    out.push({
      kind, topic, label, value, scope,
      ...(operator ? { operator } : {}),
      ...(districts ? { districts } : {}),
      source_url: src,
      source_name: (c.source_name || 'Official government source').trim(),
      retrieved_date: c.retrieved_date || TODAY,
      ...(c.note ? { note: c.note.trim() } : {}),
    });
  }
  return out;
}

function main() {
  const inPath = process.argv[2];
  if (!inPath) { console.error('Usage: npm run dm -- import-contact-channels <workflow-output.json>'); process.exit(1); }
  const wf = JSON.parse(readFileSync(resolve(inPath), 'utf8')) as {
    national?: RawChannel[];
    states?: { stateCode?: string; stateName?: string; channels?: RawChannel[] }[];
  };

  const drops: string[] = [];
  const national = clean(wf.national || [], 'national', 'IN', drops);
  const nationalValues = new Set(national.map((c) => `${c.kind}:${c.value}`));

  // Match the workflow's states onto the seed's codes BY NAME - the workflow used
  // CT/OR/UT where the seed uses CG/OD/UK, and a silent code mismatch would drop
  // three whole states' helplines.
  const codeByName = new Map<string, string>();
  for (const [code, name] of seedStates()) codeByName.set(normName(name), code);
  const districtsByState = seedDistricts();

  const states: ContactChannelsFile['states'] = [];
  const unmatched: string[] = [];
  for (const s of wf.states || []) {
    const name = s.stateName || '';
    const code = codeByName.get(normName(name)) || (s.stateCode && [...codeByName.values()].includes(s.stateCode) ? s.stateCode : '');
    if (!code) { unmatched.push(`${s.stateCode ?? '?'} / ${name}`); continue; }
    const channels = clean(s.channels || [], 'state', code, drops, districtsByState.get(code))
      // A "state" entry that just repeats the national number adds nothing.
      .filter((c) => !nationalValues.has(`${c.kind}:${c.value}`));
    if (channels.length) states.push({ stateCode: code, stateName: seedStates().get(code) || name, channels });
  }
  states.sort((a, b) => a.stateCode.localeCompare(b.stateCode));

  const file: ContactChannelsFile = { national, states };
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');

  const totalState = states.reduce((n, s) => n + s.channels.length, 0);
  console.log(`✓ contact channels → ${OUT}`);
  console.log(`  national: ${national.length} · states with channels: ${states.length} · state channels: ${totalState}`);
  const covered = new Set(states.map((s) => s.stateCode));
  const missing = [...seedStates().keys()].filter((c) => !covered.has(c));
  if (missing.length) console.log(`  states with NO state-specific channel (national still applies): ${missing.join(', ')}`);
  if (unmatched.length) console.log(`  !! unmatched states (check naming): ${unmatched.join('; ')}`);
  if (drops.length) {
    console.log(`\n  dropped ${drops.length} channel(s) that failed the source/format gate:`);
    for (const d of drops.slice(0, 25)) console.log(`   - ${d}`);
    if (drops.length > 25) console.log(`   …and ${drops.length - 25} more`);
  }
}

main();
