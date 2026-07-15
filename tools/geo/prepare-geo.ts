// One-time geo preparation. Consumes the DataMeet (Survey-of-India-conforming)
// boundary files and produces:
//   data/geo/india-districts.json  - census-2011 district polygons {d, s}
//   data/geo/india-acs.json        - assembly-constituency polygons {ac, d, pc, s}
//   data/geo/india-pcs.json        - parliamentary-constituency polygons {pc, s, hi}
// and enriches the committed seed:
//   politicians.json / constituencies.json → districts[] filled from the
//   ECI-delimitation AC→district mapping (AC = its district; PC = union of the
//   districts of its ACs). Join is by normalised name WITHIN a state - never
//   fuzzy across states. Unmatched rows are left empty and reported honestly.
//
// Sources: github.com/datameet/maps (CC-BY 2.5 IN) - states file already in repo.
// Run: npx tsx tools/geo/prepare-geo.ts <scratchpad-dir>
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Politician, Constituency } from '../../lib/types';

const SCRATCH = process.argv[2];
if (!SCRATCH) {
  console.error('Usage: npx tsx tools/geo/prepare-geo.ts <dir with raw geojson files>');
  process.exit(1);
}

const ROOT = process.cwd();
const readJSON = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

// ---------- name normalisation ----------------------------------------------
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
// Known cross-vintage spellings that identity-join should treat as equal.
const NAME_ALIAS: Record<string, string> = {
  pondicherry: 'puducherry',
};

function normName(s: string): string {
  const n = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '') // "(SC)", "(ST)" and similar qualifiers
    .replace(/&/g, 'and')
    // "Aizawl North-III" ↔ "Aizawl North 3": roman ↔ digit suffixes
    .replace(/\b(viii|vii|vi|iv|iii|ii|ix|i|v|x)\b/g, (m) => ROMAN[m])
    .replace(/[^a-z0-9]/g, '');
  return NAME_ALIAS[n] ?? n;
}

/** Small Levenshtein for last-resort within-state district reconciliation. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return dp[a.length];
}

// ---------- state canonicalisation -------------------------------------------
// Our 2-letter codes, keyed by normalised state name (covers every spelling
// variant across the three vintage files).
const STATE_CODE: Record<string, string> = {
  andamanandnicobar: 'AN', andamanandnicobarisland: 'AN', andamanandnicobarislands: 'AN',
  andhrapradesh: 'AP', arunachalpradesh: 'AR', arunanchalpradesh: 'AR', assam: 'AS',
  bihar: 'BR', chandigarh: 'CH', chhattisgarh: 'CG', chattisgarh: 'CG', uttarkhand: 'UK',
  dadraandnagarhaveli: 'DN', dadaraandnagarhavelli: 'DN', dadraandnagarhavelianddamananddiu: 'DN',
  damananddiu: 'DN', delhi: 'DL', nctofdelhi: 'DL', goa: 'GA', gujarat: 'GJ', haryana: 'HR',
  himachalpradesh: 'HP', jammuandkashmir: 'JK', jammukashmir: 'JK', jharkhand: 'JH',
  karnataka: 'KA', kerala: 'KL', ladakh: 'LA', lakshadweep: 'LD', madhyapradesh: 'MP',
  maharashtra: 'MH', manipur: 'MN', meghalaya: 'ML', mizoram: 'MZ', nagaland: 'NL',
  odisha: 'OD', orissa: 'OD', puducherry: 'PY', pondicherry: 'PY', punjab: 'PB',
  rajasthan: 'RJ', sikkim: 'SK', tamilnadu: 'TN', telangana: 'TG', tripura: 'TR',
  uttarpradesh: 'UP', uttarakhand: 'UK', uttaranchal: 'UK', westbengal: 'WB',
};
const stateCode = (name: string): string | null => STATE_CODE[normName(name)] ?? null;

// 2011/2008 files predate Telangana (2014) and Ladakh (2019) - reassign.
const TG_OLD_DISTRICTS = new Set([
  'adilabad', 'nizamabad', 'karimnagar', 'medak', 'hyderabad', 'rangareddy',
  'rangareddi', 'kvrangareddy', 'mahbubnagar', 'mahabubnagar', 'nalgonda',
  'warangal', 'khammam',
]);
const LA_DISTRICTS = new Set(['leh', 'lehladakh', 'kargil']);

function reassign(code: string | null, districtNorm: string): string | null {
  if (code === 'AP' && TG_OLD_DISTRICTS.has(districtNorm)) return 'TG';
  if (code === 'JK' && LA_DISTRICTS.has(districtNorm)) return 'LA';
  return code;
}

/** "LAHUL & SPITI" → "Lahul & Spiti" (used only when no census name matches). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of');
}

// ============================================================================
// 1. Districts - canonical polygons + canonical (proper-case) names.
// ============================================================================
const distRaw = readJSON(join(SCRATCH, 'india-districts-raw.json'));
interface DistFeature {
  type: 'Feature';
  properties: { d: string; s: string };
  geometry: unknown;
}
const distFeatures: DistFeature[] = [];
/** stateCode → (normalised district name → canonical display name) */
const censusDistricts = new Map<string, Map<string, string>>();

for (const f of distRaw.features) {
  const name = f.properties.DISTRICT as string;
  const n = normName(name);
  const code = reassign(stateCode(f.properties.ST_NM), n);
  if (!code) {
    console.warn(`districts: unmapped state "${f.properties.ST_NM}" (district ${name})`);
    continue;
  }
  // "Leh(Ladakh)" → "Leh"
  const display = name.replace(/\s*\(.*\)$/, '').trim();
  distFeatures.push({ type: 'Feature', properties: { d: display, s: code }, geometry: f.geometry });
  if (!censusDistricts.has(code)) censusDistricts.set(code, new Map());
  censusDistricts.get(code)!.set(n, display);
}

/** Resolve an AC-file district name to the canonical census name (within state). */
function canonicalDistrict(code: string, rawName: string): string {
  const n = normName(rawName);
  const m = censusDistricts.get(code);
  if (m) {
    const exact = m.get(n);
    if (exact) return exact;
    let best: { d: number; name: string } | null = null;
    for (const [cand, display] of m) {
      const d = editDistance(n, cand);
      if (d <= 2 && (!best || d < best.d)) best = { d, name: display };
    }
    if (best) return best.name;
  }
  return titleCase(rawName);
}

// ============================================================================
// 2. Assembly constituencies - polygons + AC→district→PC mapping.
// ============================================================================
const acRaw = readJSON(join(SCRATCH, 'india-acs-raw.json'));
interface AcFeature {
  type: 'Feature';
  properties: { ac: string; d: string; pc: string; s: string };
  geometry: unknown;
}
const acFeatures: AcFeature[] = [];
/** stateCode → normalised AC name → { district, pc } */
const acLookup = new Map<string, Map<string, { district: string; pc: string }>>();
/** stateCode → normalised PC name → Set of canonical district names */
const pcDistricts = new Map<string, Map<string, Set<string>>>();

for (const f of acRaw.features) {
  const p = f.properties;
  const acName = (p.AC_NAME as string | null)?.trim();
  if (!acName) continue;
  const distNorm = normName((p.DIST_NAME as string) || '');
  let code = stateCode(p.ST_NAME as string);
  code = reassign(code, distNorm);
  if (!code) continue;
  const district = canonicalDistrict(code, (p.DIST_NAME as string) || '');
  const pcName = titleCase(((p.PC_NAME as string) || '').trim());

  acFeatures.push({ type: 'Feature', properties: { ac: acName, d: district, pc: pcName, s: code }, geometry: f.geometry });

  if (!acLookup.has(code)) acLookup.set(code, new Map());
  acLookup.get(code)!.set(normName(acName), { district, pc: pcName });

  if (!pcDistricts.has(code)) pcDistricts.set(code, new Map());
  const pcMap = pcDistricts.get(code)!;
  const pcN = normName(pcName);
  if (!pcMap.has(pcN)) pcMap.set(pcN, new Set());
  pcMap.get(pcN)!.add(district);
}

// ============================================================================
// 3. Parliamentary constituencies (2019 file - post-2014 states are correct).
// ============================================================================
const pcRaw = readJSON(join(SCRATCH, 'india_pc_2019_simplified.geojson'));
interface PcFeature {
  type: 'Feature';
  properties: { pc: string; s: string; hi?: string };
  geometry: unknown;
}
const pcFeatures: PcFeature[] = [];
for (const f of pcRaw.features) {
  const p = f.properties;
  const name = (p.pc_name as string | null)?.trim();
  if (!name) continue;
  let code = stateCode((p.st_name as string) || '');
  if (normName(name) === 'ladakh') code = 'LA';
  if (!code) {
    console.warn(`pcs: unmapped state "${p.st_name}" (pc ${name})`);
    continue;
  }
  pcFeatures.push({
    type: 'Feature',
    properties: { pc: name, s: code, ...(p.pc_name_hi ? { hi: p.pc_name_hi as string } : {}) },
    geometry: f.geometry,
  });
}

// ============================================================================
// 4. Write the geo assets.
// ============================================================================
const geoDir = join(ROOT, 'data', 'geo');
mkdirSync(geoDir, { recursive: true });
const writeFC = (file: string, features: unknown[]) => {
  const out = JSON.stringify({ type: 'FeatureCollection', features });
  writeFileSync(join(geoDir, file), out);
  console.log(`✓ data/geo/${file} - ${features.length} features, ${(out.length / 1024 / 1024).toFixed(2)} MB`);
};
writeFC('india-districts.json', distFeatures);
writeFC('india-acs.json', acFeatures);
writeFC('india-pcs.json', pcFeatures);

// ============================================================================
// 5. Enrich the seed: districts[] for politicians + constituencies.
// ============================================================================
const polPath = join(ROOT, 'data', 'seed', 'politicians.json');
const conPath = join(ROOT, 'data', 'seed', 'constituencies.json');
const politicians = readJSON(polPath) as Politician[];
const constituencies = readJSON(conPath) as Constituency[];

const stats = new Map<string, { acHit: number; acMiss: number; pcHit: number; pcMiss: number }>();
const stat = (code: string) => {
  if (!stats.has(code)) stats.set(code, { acHit: 0, acMiss: 0, pcHit: 0, pcMiss: 0 });
  return stats.get(code)!;
};

/** Same-name district in this state (exact or edit-distance ≤ 2), if any.
 *  Many constituencies are named after their district - a safe identity join. */
function sameNamedDistrict(code: string, consName: string): string | null {
  const m = censusDistricts.get(code);
  if (!m) return null;
  const n = normName(consName);
  const exact = m.get(n);
  if (exact) return exact;
  let best: { d: number; name: string } | null = null;
  for (const [cand, display] of m) {
    const d = editDistance(n, cand);
    if (d <= 2 && (!best || d < best.d)) best = { d, name: display };
  }
  return best?.name ?? null;
}

function districtsFor(code: string, type: string, consName: string, record = true): string[] | null {
  const s = record ? stat(code) : null;
  if (type === 'AC') {
    const hit = acLookup.get(code)?.get(normName(consName));
    if (hit) {
      if (s) s.acHit++;
      return [hit.district];
    }
    // Newer-delimitation AC (e.g. Assam 2023, J&K 2022) named after its district.
    const named = sameNamedDistrict(code, consName);
    if (named) {
      if (s) s.acHit++;
      return [named];
    }
    if (s) s.acMiss++;
    return null;
  }
  if (type === 'PC') {
    const set = pcDistricts.get(code)?.get(normName(consName));
    if (set && set.size > 0) {
      if (s) s.pcHit++;
      return [...set].sort();
    }
    const named = sameNamedDistrict(code, consName);
    if (named) {
      if (s) s.pcHit++;
      return [named];
    }
    // Assembly-less UTs: a lone PC covers the whole territory.
    const all = censusDistricts.get(code);
    if (all && all.size <= 3) {
      if (s) s.pcHit++;
      return [...all.values()].sort();
    }
    if (s) s.pcMiss++;
    return null;
  }
  return null; // RS / MLC - no territorial constituency
}

let polUpdated = 0;
for (const p of politicians) {
  const ds = districtsFor(p.stateCode, p.constituencyType, p.constituencyName);
  if (ds) {
    p.districts = ds;
    polUpdated++;
  }
}
let conUpdated = 0;
for (const c of constituencies) {
  const ds = districtsFor(c.stateCode, c.type, c.name, false);
  if (ds) {
    c.districts = ds;
    conUpdated++;
  }
}

writeFileSync(polPath, JSON.stringify(politicians, null, 2));
writeFileSync(conPath, JSON.stringify(constituencies, null, 2));
console.log(`✓ politicians.json - districts filled for ${polUpdated}/${politicians.length}`);
console.log(`✓ constituencies.json - districts filled for ${conUpdated}/${constituencies.length}`);

// Honest per-state join report (worst first).
console.log('\nPer-state join report (AC hit/miss, PC hit/miss):');
const rows = [...stats.entries()].sort(
  (a, b) => b[1].acMiss + b[1].pcMiss - (a[1].acMiss + a[1].pcMiss),
);
for (const [code, s] of rows) {
  const flag = s.acMiss + s.pcMiss > 0 ? ' ⚠' : '';
  console.log(
    `  ${code}: AC ${s.acHit}/${s.acHit + s.acMiss} · PC ${s.pcHit}/${s.pcHit + s.pcMiss}${flag}`,
  );
}
