/**
 * Data-manager step: verify stored Wikidata links + photos, stripping only on
 * POSITIVE evidence of a wrong match (a wrong photo/fact is worse than a gap,
 * but Wikidata items for tier-2/3 members are often sparse, so absence of
 * evidence is NOT treated as evidence of absence).
 *
 * Entity-level strip (removes qid + QID-cited facts + Commons photo) when:
 *   - the API reports the entity missing/deleted, or
 *   - the entity is not a human (P31 ≠ Q5 - e.g. a district item), or
 *   - its label/aliases do not match the member's name (transliteration-aware
 *     compact 6-gram overlap), or
 *   - its only assembly/council memberships (P39) are for a DIFFERENT state
 *     and nothing else (constituency/party) ties it to ours - the namesake trap.
 *
 * Photo-level strip (photo only) when the Commons filename is clearly not a
 * portrait of this person: an .svg, a generic scene (map/beach/road/rally…),
 * another person's name, or latin text sharing no 4-gram with the name.
 * Native-script filenames and camera-code filenames are kept.
 *
 * Usage:  npm run dm -- verify-wikidata
 *         VERIFY_DRY=1 npm run dm -- verify-wikidata   (report only, no writes)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const WD_API = 'https://www.wikidata.org/w/api.php';
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const DRY = process.env.VERIFY_DRY === '1';

async function api(params: Record<string, string>): Promise<any> {
  const u = WD_API + '?format=json&formatversion=2&origin=*&' + new URLSearchParams(params);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (attempt === 4) throw e;
    }
    await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
  }
}

type Entity = any;
async function getEntities(qids: string[], props: string): Promise<Map<string, Entity>> {
  const map = new Map<string, Entity>();
  const uniq = [...new Set(qids)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    try {
      const jr = await api({ action: 'wbgetentities', ids: batch.join('|'), props, languages: 'en' });
      for (const [id, ent] of Object.entries(jr.entities || {})) map.set(id, ent);
    } catch (e) {
      console.warn(`  ! entity batch ${i} failed: ${(e as Error).message}`);
    }
    if (i % 1000 === 0 && i > 0) console.log(`  … fetched ${i}/${uniq.length}`);
  }
  return map;
}

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s: string) => norm(s).replace(/ /g, '');

/** Do two compact strings share any substring of length L? (transliteration-
 *  tolerant name overlap: "Ayyannapatrudu" ~ "Ch. Ayyanna Patrudu"). */
function sharesGram(a: string, b: string, L: number): boolean {
  if (a.length < L || b.length < L) return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  for (let i = 0; i + L <= short.length; i++) if (long.includes(short.slice(i, i + L))) return true;
  return false;
}

function claimIds(e: Entity, prop: string): string[] {
  return (e?.claims?.[prop] || [])
    .map((st: any) => st?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

/** Two name tokens "agree": exact, spelling variant (lev≤1, same first letter,
 *  ≥4 chars), one a prefix of the other (≥5), or an initial vs a full token. */
function tokenAgree(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0];
  if (a.length >= 4 && b.length >= 4 && a[0] === b[0] && lev(a, b) <= 1) return true;
  if (a.length >= 5 && b.startsWith(a)) return true;
  if (b.length >= 5 && a.startsWith(b)) return true;
  return false;
}

/** Name check across label + aliases: 2 agreeing tokens (transliteration-,
 *  initials- and typo-tolerant), or a 6-char compact overlap. */
function nameMatches(p: Politician, e: Entity): boolean {
  const labels: string[] = [];
  if (e?.labels?.en?.value) labels.push(e.labels.en.value);
  for (const a of e?.aliases?.en || []) if (a?.value) labels.push(a.value);
  if (labels.length === 0) return true; // nothing to judge by - don't strip on absence
  const ours = norm(p.name).split(' ').filter(Boolean);
  const cn = compact(p.name);
  for (const l of labels) {
    const theirs = norm(l).split(' ').filter(Boolean);
    let agree = 0;
    for (const t of theirs) if (ours.some((o) => tokenAgree(o, t))) agree++;
    const meaningful = ours.filter((t) => t.length >= 3).length;
    if (agree >= Math.min(2, Math.max(1, meaningful))) return true;
    if (sharesGram(cn, compact(l), 6)) return true;
  }
  return false;
}

/** Same-person surname acceptance: last name tokens equal AND the item shows
 *  house/state/constituency evidence tying it to our record. */
function surnameWithEvidence(p: Politician, e: Entity, posLabels: string[], districtLabels: string[]): boolean {
  const label = e?.labels?.en?.value;
  if (!label) return false;
  const ourLast = norm(p.name).split(' ').filter(Boolean).pop() || '';
  const theirLast = norm(label).split(' ').filter(Boolean).pop() || '';
  if (ourLast.length < 3 || ourLast !== theirLast) return false;
  const nState = norm(p.state);
  const nCons = compact(p.constituencyName);
  const stateOk = posLabels.concat(districtLabels).some((l) => norm(l).includes(nState));
  const consOk = !!nCons && districtLabels.some((l) => sharesGram(compact(l), nCons, Math.min(6, nCons.length)));
  return stateOk || consOk;
}

// ---- photo filename sanity ---------------------------------------------------
const GENERIC_SCENE =
  /(map|beach|road|inaugur|launch|rally|function|meeting|view|temple|station|bridge|logo|flag|emblem|banner|poster|crowd|ceremony|addressing|gathering|block|district|assembly building|office|villag|lake|river|fort|market)/;
const STOP_TOKENS = new Set([
  'the', 'shri', 'smt', 'kumari', 'minister', 'chief', 'deputy', 'president', 'vice', 'honble',
  'state', 'india', 'indian', 'government', 'cropped', 'photo', 'image', 'portrait', 'official',
  'profile', 'picture', 'with', 'from', 'during', 'after', 'before',
]);

/** Should this Commons photo be stripped? Returns a reason, or null to keep. */
function photoStripReason(p: Politician): string | null {
  if (!p.photo_url) return null;
  const m = decodeURIComponent(p.photo_url).match(/FilePath\/([^?]+)/);
  if (!m) return null;
  const raw = m[1];
  if (/\.svg$/i.test(raw)) return 'svg file (not a portrait)';
  const base = raw.replace(/\.[a-z0-9]+$/i, '');
  const fn = norm(base);
  const fnWords = new Set(fn.split(' '));
  const cn = compact(p.name);
  const nameToks = norm(p.name).split(' ').filter(Boolean);
  if (nameToks.filter((t) => t.length >= 4).some((t) => fn.includes(t))) return null; // shares a name token
  if (sharesGram(cn, compact(base), 6)) return null; // joined/split transliteration
  // surname as a word ("B.K Deb" for Biplab Kumar Deb), even when short
  const last = nameToks[nameToks.length - 1] || '';
  if (last.length >= 3 && fnWords.has(last)) return null;
  // the person's own constituency in the filename ("Mla of PRANPUR")
  const consToks = norm(p.constituencyName).split(' ').filter((t) => t.length >= 5);
  if (consToks.some((t) => fn.includes(t))) return null;
  // initials matching the name: spaced ("U T K…") or merged ("PkvRanchi",
  // "APJPCV" for P. C. Vishnunadh)
  const initials = nameToks.map((t) => t[0]).join('');
  const fnInitials = fn.split(' ').filter((t) => t.length === 1).join('');
  if (fnInitials.length >= 2 && initials.includes(fnInitials)) return null;
  if (initials.length >= 3 && compact(base).includes(initials)) return null;
  // transliteration variants ("Koyel Mullick" for Koel Mallick)
  const fnToks = fn.split(' ').filter((t) => /^[a-z]+$/.test(t) && t.length >= 4);
  if (fnToks.some((ft) => nameToks.some((nt) => tokenAgree(nt, ft)))) return null;
  const latin = base.replace(/[^A-Za-z]/g, '');
  if (latin.length < 4) return null; // native-script or camera-code name - keep
  if (GENERIC_SCENE.test(fn)) return `generic scene filename ("${raw}")`;
  const alphaToks = fn.split(' ').filter((t) => /^[a-z]+$/.test(t) && t.length >= 4 && !STOP_TOKENS.has(t));
  if (alphaToks.length >= 2) return `filename names someone else ("${raw}")`;
  if (!sharesGram(cn, compact(base), 4)) return `filename unrelated to name ("${raw}")`;
  return null;
}

// ---- main ---------------------------------------------------------------------
const INDIA_STATES = [
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat',
  'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh',
  'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan',
  'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
  'delhi', 'jammu and kashmir', 'puducherry',
];

// 2000/2014 state bifurcations: a member's earlier service in the parent
// state's assembly is the SAME career, never a namesake contradiction.
const BIFURCATION_PARTNER: Record<string, string> = {
  'andhra pradesh': 'telangana', telangana: 'andhra pradesh',
  bihar: 'jharkhand', jharkhand: 'bihar',
  'madhya pradesh': 'chhattisgarh', chhattisgarh: 'madhya pradesh',
  'uttar pradesh': 'uttarakhand', uttarakhand: 'uttar pradesh',
};

async function main() {
  const politicians: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  const withQid = politicians.filter((p) => p.wikidata_qid);
  console.log(`verify-wikidata: checking ${withQid.length} stored QIDs${DRY ? ' (dry run)' : ''}`);

  const entities = await getEntities(withQid.map((p) => p.wikidata_qid!), 'claims|labels|aliases');
  const refIds: string[] = [];
  for (const p of withQid) {
    const e = entities.get(p.wikidata_qid!);
    if (!e) continue;
    refIds.push(...claimIds(e, 'P768'), ...claimIds(e, 'P39'), ...claimIds(e, 'P102'));
  }
  console.log(`  resolving ${new Set(refIds).size} referenced labels…`);
  const labelEnts = await getEntities(refIds, 'labels');
  const lab = (id: string) => labelEnts.get(id)?.labels?.en?.value || '';

  let kept = 0;
  let stripped = 0;
  let factsRemoved = 0;
  let photosRemoved = 0;
  const log: string[] = [];

  const stripEntity = (p: Politician, why: string) => {
    stripped++;
    log.push(`QID  ${p.id} (${p.wikidata_qid}): ${why}`);
    if (DRY) return;
    const qidUrl = `wikidata.org/wiki/${p.wikidata_qid}`;
    const before = p.facts.length;
    const removedTerms = p.facts.some((f) => f.field_type === 'terms_served' && f.source_url.includes(qidUrl));
    p.facts = p.facts.filter((f) => !f.source_url.includes(qidUrl));
    factsRemoved += before - p.facts.length;
    if (removedTerms) delete p.terms_served;
    if (p.photo_url && /wikimedia|wikipedia/i.test(`${p.photo_url} ${p.photo_license || ''}`)) {
      delete p.photo_url;
      delete p.photo_license;
      photosRemoved++;
    }
    delete p.wikidata_qid;
  };

  for (const p of withQid) {
    const qid = p.wikidata_qid!;
    const e = entities.get(qid);
    if (!e) continue; // batch fetch failed - never strip on a network gap
    if (e.missing !== undefined) {
      stripEntity(p, 'entity deleted on Wikidata');
      continue;
    }
    if (!claimIds(e, 'P31').includes('Q5')) {
      stripEntity(p, `not a human item (${e.labels?.en?.value || 'no label'})`);
      continue;
    }
    const districtLabels = claimIds(e, 'P768').map(lab).filter(Boolean);
    const posLabels = claimIds(e, 'P39').map(lab).filter(Boolean);
    if (!nameMatches(p, e) && !surnameWithEvidence(p, e, posLabels, districtLabels)) {
      stripEntity(p, `label "${e.labels?.en?.value || '?'}" does not match name`);
      continue;
    }
    // Namesake trap - ONLY for sitting assembly/council members: the item's
    // assembly memberships are all for a DIFFERENT state and nothing ties it
    // to ours. NOT applied to MPs (careers legitimately span states via the
    // Rajya Sabha / earlier assembly stints), and bifurcation partners
    // (AP↔TG, BR↔JH, MP↔CG, UP↔UK) never count as contradictions.
    if (p.house === 'Vidhan Sabha' || p.house === 'Vidhan Parishad') {
      const nState = norm(p.state);
      const partner = BIFURCATION_PARTNER[nState];
      const assemblyLabels = posLabels.filter((l) => /legislative assembly|legislative council|vidhan/i.test(l));
      if (assemblyLabels.length > 0) {
        const mentionsOurs = assemblyLabels.some((l) => {
          const nl = norm(l);
          return nl.includes(nState) || (partner && nl.includes(partner));
        });
        const mentionsOther = assemblyLabels.some((l) =>
          INDIA_STATES.some((s) => s !== nState && s !== partner && norm(l).includes(s)),
        );
        const nCons = compact(p.constituencyName);
        const consOk = !!nCons && districtLabels.some((l) => sharesGram(compact(l), nCons, Math.min(6, nCons.length)));
        if (!mentionsOurs && mentionsOther && !consOk) {
          stripEntity(p, `member of a different state's legislature (${assemblyLabels[0]})`);
          continue;
        }
      }
    }
    kept++;
  }

  // ---- photo filename pass (independent of QID verdict) --------------------
  for (const p of politicians) {
    if (!p.photo_url) continue;
    const why = photoStripReason(p);
    if (!why) continue;
    log.push(`FOTO ${p.id}: ${why}`);
    photosRemoved++;
    if (!DRY) {
      delete p.photo_url;
      delete p.photo_license;
    }
  }

  console.log(`\n  QIDs kept: ${kept}  stripped: ${stripped}  facts removed: ${factsRemoved}  photos removed: ${photosRemoved}`);
  if (log.length) {
    console.log('  actions:');
    for (const l of log.slice(0, 120)) console.log(`   - ${l}`);
    if (log.length > 120) console.log(`   … and ${log.length - 120} more`);
  }

  if (!DRY) {
    writeFileSync(SEED, JSON.stringify(politicians, null, 2) + '\n');
    console.log(`\n✓ wrote ${SEED}`);
  } else {
    console.log('\n(dry run - nothing written)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
