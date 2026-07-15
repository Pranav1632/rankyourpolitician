// Shared data-manager logic: read the local seed, validate it, and publish to
// Firestore with the Admin SDK. This runs ONLY on your machine, using a
// service-account key that never leaves it. Never imported by the deployed site.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Constituency, Fact } from '../../lib/types';

export const ROOT = resolve(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
  '..',
);
const SEED_DIR = resolve(ROOT, 'data', 'seed');

export function loadSeed(): { politicians: Politician[]; constituencies: Constituency[] } {
  return {
    politicians: JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8')),
    constituencies: JSON.parse(readFileSync(resolve(SEED_DIR, 'constituencies.json'), 'utf8')),
  };
}

export function savePoliticians(politicians: Politician[]) {
  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(politicians, null, 2) + '\n');
}

export interface Issue {
  politicianId: string;
  name: string;
  severity: 'error' | 'warn';
  message: string;
}

export function validateDataset(): { issues: Issue[]; ok: boolean } {
  const { politicians, constituencies } = loadSeed();
  const consIds = new Set(constituencies.map((c) => c.id));
  const issues: Issue[] = [];
  const push = (p: Politician, severity: Issue['severity'], message: string) =>
    issues.push({ politicianId: p.id, name: p.name, severity, message });

  for (const p of politicians) {
    // Upper-house members (Rajya Sabha MPs, and MLCs in the Legislative Council)
    // are indirectly elected/nominated with NO territorial constituency, so an
    // empty constituencyId (and no districts) is correct for them.
    const upperHouse =
      p.constituencyType === 'RS' || p.constituencyType === 'MLC' ||
      p.house === 'Rajya Sabha' || p.house === 'Vidhan Parishad';
    if (!upperHouse) {
      if (!p.constituencyId || !consIds.has(p.constituencyId)) push(p, 'error', `constituencyId "${p.constituencyId}" not found in constituencies`);
      if (!p.districts?.length) push(p, 'warn', 'no districts listed (district-level ranking will be empty)');
    }
    if (!p.state || !p.stateCode) push(p, 'error', 'missing state/stateCode');
    for (const f of p.facts as Fact[]) {
      if (!f.source_url) push(p, 'error', `fact "${f.field_type}" has no source_url (no citation, no claim)`);
      if (!f.retrieved_date) push(p, 'warn', `fact "${f.field_type}" has no retrieved_date`);
    }
    if (!p.is_minister && Object.keys(p.metrics || {}).length === 0)
      push(p, 'warn', 'no scored metrics - performance percentile will be unavailable');
  }

  // ONE PERSON, ONE AFFIDAVIT PAGE.
  // A MyNeta candidate page describes exactly one candidate in one seat, so two
  // members citing the same page means one of them is publishing somebody else's
  // sworn declaration - the most damaging error this dataset can carry, and the
  // one every fuzzy-matching bug eventually produces. It has happened twice:
  // Bihar's Aurangabad winner attributed to Maharashtra's MP (16 declared
  // criminal cases against a man who declared 4), and Aizawl North-I's MLA
  // attributed to Aizawl North-II's. Both were invisible to name- and
  // seat-similarity checks but trivially visible here, so this is an ERROR and
  // blocks publish.
  const byPage = new Map<string, Politician[]>();
  for (const p of politicians) {
    const seen = new Set<string>();
    for (const f of p.facts as Fact[]) {
      if (!/myneta\.info\/[^/]+\/candidate\.php\?candidate_id=\d+/.test(f.source_url || '')) continue;
      if (seen.has(f.source_url)) continue; // one member may cite its page for several fields
      seen.add(f.source_url);
      if (!byPage.has(f.source_url)) byPage.set(f.source_url, []);
      byPage.get(f.source_url)!.push(p);
    }
  }
  for (const [url, members] of byPage) {
    if (members.length < 2) continue;
    for (const p of members) {
      const others = members.filter((m) => m.id !== p.id).map((m) => `${m.name} (${m.stateCode} ${m.constituencyName})`);
      push(p, 'error', `cites the same affidavit page as ${others.join(', ')} - one of them has another person's declaration: ${url}`);
    }
  }

  return { issues, ok: !issues.some((i) => i.severity === 'error') };
}

export function datasetStats() {
  const { politicians, constituencies } = loadSeed();
  const states = new Set(politicians.map((p) => p.stateCode));
  const facts = politicians.reduce((n, p) => n + p.facts.length, 0);
  return {
    politicians: politicians.length,
    constituencies: constituencies.length,
    states: states.size,
    facts,
    ministers: politicians.filter((p) => p.is_minister).length,
  };
}

function loadJson<T>(name: string): T[] {
  const p = resolve(SEED_DIR, name);
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

/** Write the full dataset to Firestore. Requires Admin credentials. */
export async function publishDataset(): Promise<{
  politicians: number;
  constituencies: number;
  central_government: number;
  office_seats: number;
}> {
  const { getDb } = await import('../../lib/firebase-admin');
  const db = getDb();
  if (!db)
    throw new Error(
      'Firestore is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS in .env.local (see .env.example).',
    );

  const { politicians, constituencies } = loadSeed();
  const central = loadJson<{ id: string }>('central_government.json');
  const officials = loadJson<{ id: string }>('district_officials.json');

  const commitInChunks = async (coll: string, docs: { id: string }[]) => {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + 400)) batch.set(db.collection(coll).doc(d.id), d as any);
      await batch.commit();
    }
  };

  await commitInChunks('constituencies', constituencies);
  await commitInChunks('politicians', politicians);
  await commitInChunks('central_government', central);
  await commitInChunks('office_seats', officials);
  return {
    politicians: politicians.length,
    constituencies: constituencies.length,
    central_government: central.length,
    office_seats: officials.length,
  };
}

/** Ask the deployed site to drop its page cache (POST /api/revalidate) so the
 *  publish shows up on the next visit instead of the next daily revalidation.
 *  No-op unless REVALIDATE_URL and REVALIDATE_SECRET are set in .env.local,
 *  and never fatal: the publish itself already succeeded, and every page
 *  self-heals within a day regardless. */
export async function requestSiteRevalidation(): Promise<void> {
  const base = process.env.REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!base || !secret) {
    console.log('i Skipped site revalidation (REVALIDATE_URL / REVALIDATE_SECRET not set) - pages refresh within a day.');
    return;
  }
  try {
    const res = await fetch(new URL('/api/revalidate', base), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });
    console.log(
      res.ok
        ? '✓ Site cache invalidated - pages regenerate on next visit.'
        : `⚠ Site revalidation returned ${res.status} - pages refresh within a day.`,
    );
  } catch (err) {
    console.log(`⚠ Site revalidation failed (${err instanceof Error ? err.message : err}) - pages refresh within a day.`);
  }
}
