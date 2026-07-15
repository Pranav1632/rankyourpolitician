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
