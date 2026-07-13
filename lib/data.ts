// Unified read layer. Loads the dataset from Firestore when configured, else
// from the committed seed JSON, then computes both ranking axes in-process and
// memoises for a short window. Pages are ISR-cached on top of this, so the DB
// is touched rarely. Vote WRITES go through app/api/vote (Admin SDK) separately.
import type {
  Politician,
  Constituency,
  Ranking,
  RankingLevel,
  PerformanceScore,
  SentimentScore,
  VoteAggregate,
} from './types';
import {
  buildRankings,
  computePerformanceScores,
  computeSentimentScore,
} from './ranking';
import { getDb } from './firebase-admin';
import { datasetLastUpdated } from './format';
import { MINISTER_RANK_LABEL, type MinisterRank, type Fact, type PerfMetric } from './types';
import seedPoliticians from '@/data/seed/politicians.json';
import seedConstituencies from '@/data/seed/constituencies.json';
import seedCentral from '@/data/seed/central_government.json';
import seedDistrictOfficials from '@/data/seed/district_officials.json';
import type { Minister, OfficeSeat, OfficeType, OfficeLevel } from './types';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface Index {
  politicians: Politician[];
  politicianById: Map<string, Politician>;
  constituencies: Constituency[];
  constituencyById: Map<string, Constituency>;
  performance: Map<string, PerformanceScore>;
  sentiment: Map<string, SentimentScore>;
  rankingByKey: Map<string, Ranking>;
  states: { stateCode: string; state: string; count: number }[];
  source: 'firestore' | 'seed';
  builtAt: string;
}

interface Dataset {
  politicians: Politician[];
  constituencies: Constituency[];
  voteAggregates: Map<string, VoteAggregate>;
  source: 'firestore' | 'seed';
}

export function rankingKey(level: RankingLevel, geo: string): string {
  return `${level}|${geo}`;
}

/** Firestore-safe doc id (used by the data manager when precomputing). */
export function rankingDocId(level: RankingLevel, geo: string): string {
  return `${level}__${geo || 'ALL'}`.replace(/[/#?[\]]/g, '_');
}

async function loadFromFirestore(): Promise<Dataset | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const [polSnap, consSnap, aggSnap] = await Promise.all([
      db.collection('politicians').get(),
      db.collection('constituencies').get(),
      db.collection('vote_aggregates').get(),
    ]);
    if (polSnap.empty) return null; // not published yet → fall back to seed
    const voteAggregates = new Map<string, VoteAggregate>();
    aggSnap.forEach((d) => voteAggregates.set(d.id, d.data() as VoteAggregate));
    return {
      politicians: polSnap.docs.map((d) => d.data() as Politician),
      constituencies: consSnap.docs.map((d) => d.data() as Constituency),
      voteAggregates,
      source: 'firestore',
    };
  } catch (err) {
    console.error('[data] Firestore read failed, using seed:', err);
    return null;
  }
}

function loadFromSeed(): Dataset {
  return {
    politicians: seedPoliticians as unknown as Politician[],
    constituencies: seedConstituencies as unknown as Constituency[],
    voteAggregates: new Map(),
    source: 'seed',
  };
}

async function loadDataset(): Promise<Dataset> {
  // getDb() returns null during `next build` (free-tier quota guard), so this
  // transparently uses the committed seed snapshot at build time and Firestore
  // at runtime.
  return (await loadFromFirestore()) ?? loadFromSeed();
}

function buildIndex(ds: Dataset): Index {
  const performance = computePerformanceScores(ds.politicians);
  const sentiment = new Map<string, SentimentScore>();
  for (const p of ds.politicians) {
    sentiment.set(p.id, computeSentimentScore(p.id, ds.voteAggregates.get(p.id)));
  }
  const rankings = buildRankings(ds.politicians, performance, sentiment);

  const rankingByKey = new Map<string, Ranking>();
  for (const r of rankings) rankingByKey.set(rankingKey(r.level, r.geo), r);

  const stateAgg = new Map<string, { state: string; count: number }>();
  for (const p of ds.politicians) {
    const cur = stateAgg.get(p.stateCode) ?? { state: p.state, count: 0 };
    cur.count++;
    stateAgg.set(p.stateCode, cur);
  }

  return {
    politicians: ds.politicians,
    politicianById: new Map(ds.politicians.map((p) => [p.id, p])),
    constituencies: ds.constituencies,
    constituencyById: new Map(ds.constituencies.map((c) => [c.id, c])),
    performance,
    sentiment,
    rankingByKey,
    states: [...stateAgg.entries()]
      .map(([stateCode, v]) => ({ stateCode, state: v.state, count: v.count }))
      .sort((a, b) => a.state.localeCompare(b.state)),
    source: ds.source,
    builtAt: new Date().toISOString(),
  };
}

// Short in-process memo so a burst of requests shares one computation. ISR
// caches the rendered page on top of this; vote updates surface within TTL.
let cache: { at: number; index: Index } | null = null;
const TTL_MS = 60_000;

export async function getIndex(): Promise<Index> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.index;
  const index = buildIndex(await loadDataset());
  cache = { at: Date.now(), index };
  return index;
}

// ---- Query helpers used by the pages ---------------------------------------

export async function getRanking(level: RankingLevel, geo = ''): Promise<Ranking | null> {
  const idx = await getIndex();
  return idx.rankingByKey.get(rankingKey(level, geo)) ?? null;
}

export async function getNationalRanking(): Promise<Ranking | null> {
  return getRanking('national', '');
}

export async function getStates() {
  return (await getIndex()).states;
}

export async function getStateByCode(stateCode: string) {
  return (await getIndex()).states.find((s) => s.stateCode === stateCode) ?? null;
}

export async function getDistrictsInState(stateCode: string): Promise<string[]> {
  const idx = await getIndex();
  const set = new Set<string>();
  for (const p of idx.politicians) {
    if (p.stateCode === stateCode) p.districts.forEach((d) => set.add(d));
  }
  return [...set].sort();
}

export async function getConstituenciesInState(stateCode: string): Promise<Constituency[]> {
  const idx = await getIndex();
  return idx.constituencies
    .filter((c) => c.stateCode === stateCode)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getConstituency(id: string): Promise<Constituency | null> {
  return (await getIndex()).constituencyById.get(id) ?? null;
}

/** A unified person: aggregates an MP record and/or one or more ministerial
 *  roles under one canonical id. This is what a profile page renders. */
export interface PersonView {
  kind: 'elected' | 'official';
  id: string;
  name: string;
  name_hi?: string;
  party?: string;
  house?: string;
  // official-only:
  officeType?: OfficeType;
  officeLevel?: OfficeLevel;
  service?: string;
  office_email?: string;
  office_phone?: string;
  as_of?: string;
  district?: string;
  constituency?: string;
  constituencyId?: string;
  state?: string;
  stateCode?: string;
  districts: string[];
  photo_url?: string;
  is_minister: boolean;
  is_pm: boolean;
  current_position?: string;
  portfolios: string[]; // all national departments this person runs
  ministerRank?: MinisterRank;
  ministerRankLabel?: string;
  neutral_summary?: string;
  terms_served?: number;
  facts: Fact[];
  metrics: Partial<Record<PerfMetric, number>>;
  performance: PerformanceScore | null;
  hasRecord: boolean; // do we have the detailed MP fact record?
  sources: [string, string][];
  identity_source?: { url: string; name: string; retrieved_date: string };
  party_note?: string;
  party_history?: { party: string; from: string; until?: string; current?: boolean }[];
}

/** Canonical id for a minister: their linked MP id if any, else their own id. */
function ministerPersonId(m: { id: string; politicianId?: string }): string {
  return m.politicianId || m.id;
}

export async function getPerson(
  id: string,
): Promise<{ redirectTo?: string; person?: PersonView } | null> {
  const idx = await getIndex();
  const central = await getCentralGovernment();

  const p = idx.politicianById.get(id);
  if (p) {
    const roles = central.filter((m) => m.politicianId === id);
    const portfolios = [...new Set(roles.flatMap((r) => r.portfolios))];
    const extraSources = roles.filter((r) => r.source_url).map((r) => [r.source_url, r.source_name] as [string, string]);
    return {
      person: {
        kind: 'elected' as const,
        id: p.id,
        name: p.name,
        name_hi: p.name_hi,
        party: p.party,
        house: p.house,
        constituency: p.constituencyName,
        constituencyId: p.constituencyId,
        state: p.state,
        stateCode: p.stateCode,
        districts: p.districts,
        photo_url: p.photo_url,
        is_minister: p.is_minister || roles.length > 0,
        is_pm: roles.some((r) => r.rank === 'PM'),
        current_position: p.current_position,
        portfolios,
        ministerRank: roles[0]?.rank,
        ministerRankLabel: roles[0] ? MINISTER_RANK_LABEL[roles[0].rank] : undefined,
        neutral_summary: p.neutral_summary,
        terms_served: p.terms_served,
        facts: p.facts,
        metrics: p.metrics,
        performance: idx.performance.get(id) ?? null,
        hasRecord: p.facts.length > 0,
        sources: [...new Map([...p.facts.map((f) => [f.source_url, f.source_name] as [string, string]), ...extraSources])],
        identity_source: p.identity_source,
        party_note: p.party_note,
        party_history: p.party_history,
      },
    };
  }

  const m = central.find((x) => x.id === id);
  if (m) {
    // A minister who is also an MP in our dataset → canonical page is the MP id.
    if (m.politicianId && idx.politicianById.get(m.politicianId)) return { redirectTo: m.politicianId };
    const roles = central.filter((x) => ministerPersonId(x) === id);
    const portfolios = [...new Set(roles.flatMap((r) => r.portfolios))];
    return {
      person: {
        kind: 'elected' as const,
        id: m.id,
        name: m.name,
        party: m.party,
        house: m.house,
        constituency: m.constituency,
        state: m.state,
        districts: [],
        photo_url: m.photo_url,
        is_minister: true,
        is_pm: m.rank === 'PM',
        current_position: MINISTER_RANK_LABEL[m.rank],
        portfolios,
        ministerRank: m.rank,
        ministerRankLabel: MINISTER_RANK_LABEL[m.rank],
        facts: [],
        metrics: {},
        performance: null,
        hasRecord: false,
        sources: m.source_url ? [[m.source_url, m.source_name]] : [],
      },
    };
  }

  // Appointed official (incumbent of an office seat) — INFO-ONLY person.
  const seats = await allOfficeSeats();
  const seat = seats.find((s) => s.incumbent && slugify(s.incumbent.name) === id);
  if (seat && seat.incumbent) {
    const inc = seat.incumbent;
    const stateName = idx.states.find((s) => s.stateCode === seat.stateCode)?.state ?? seat.stateCode;
    return {
      person: {
        kind: 'official' as const,
        id,
        name: inc.name,
        service: inc.service,
        officeType: seat.officeType,
        officeLevel: seat.level,
        office_email: inc.office_email,
        office_phone: inc.office_phone,
        as_of: inc.as_of,
        district: seat.district,
        state: stateName,
        stateCode: seat.stateCode,
        districts: [],
        is_minister: false,
        is_pm: false,
        portfolios: [],
        facts: [],
        metrics: {},
        performance: null,
        hasRecord: false,
        sources: inc.source_url ? [[inc.source_url, inc.source_name]] : [],
      },
    };
  }
  return null;
}

async function allOfficeSeats(): Promise<OfficeSeat[]> {
  let seeds = seedDistrictOfficials as unknown as OfficeSeat[];
  const db = getDb();
  if (db) {
    try {
      const snap = await db.collection('office_seats').get();
      if (!snap.empty) seeds = snap.docs.map((d) => d.data() as OfficeSeat);
    } catch {
      /* fall back to seed */
    }
  }
  return seeds;
}

/** Stable person id for an appointed official (used to link their name). */
export function officialPersonId(name: string): string {
  return slugify(name);
}

/** All appointed officials with a published incumbent (for search). */
export async function getOfficials(): Promise<
  { id: string; name: string; service?: string; officeType: OfficeType; district?: string; stateCode?: string; state?: string }[]
> {
  const idx = await getIndex();
  const seats = await allOfficeSeats();
  return seats
    .filter((s) => s.incumbent)
    .map((s) => ({
      id: slugify(s.incumbent!.name),
      name: s.incumbent!.name,
      service: s.incumbent!.service,
      officeType: s.officeType,
      district: s.district,
      stateCode: s.stateCode,
      state: idx.states.find((x) => x.stateCode === s.stateCode)?.state,
    }));
}

/** All canonical person ids: every MP, plus every minister who is NOT an MP. */
export async function getAllPersonIds(): Promise<string[]> {
  const idx = await getIndex();
  const central = await getCentralGovernment();
  const ids = new Set(idx.politicians.map((p) => p.id));
  for (const m of central) if (!m.politicianId) ids.add(m.id);
  for (const seat of await allOfficeSeats()) if (seat.incumbent) ids.add(slugify(seat.incumbent.name));
  return [...ids];
}

/** Does a person (MP or minister) exist under this id? Used by the vote API. */
export async function personExists(id: string): Promise<boolean> {
  const r = await getPerson(id);
  return Boolean(r && (r.person || r.redirectTo));
}

export async function getDataSource(): Promise<'firestore' | 'seed'> {
  return (await getIndex()).source;
}

export async function getCentralGovernment(): Promise<Minister[]> {
  const db = getDb();
  if (db) {
    try {
      const snap = await db.collection('central_government').get();
      if (!snap.empty) return snap.docs.map((d) => d.data() as Minister);
    } catch (err) {
      console.error('[data] central_government read failed, using seed:', err);
    }
  }
  return seedCentral as unknown as Minister[];
}

export async function getMinister(id: string): Promise<Minister | null> {
  return (await getCentralGovernment()).find((m) => m.id === id) ?? null;
}

/** The key appointed offices for a district (durable roles), with the current
 *  incumbent merged in where we have a cited one. Always returns the 2 core
 *  seats (Collector/DM + SP) so the "who to approach" is shown even without a name. */
export async function getDistrictOfficials(stateCode: string, district: string): Promise<OfficeSeat[]> {
  let seeded = seedDistrictOfficials as unknown as OfficeSeat[];
  const db = getDb();
  if (db) {
    try {
      const snap = await db
        .collection('office_seats')
        .where('stateCode', '==', stateCode)
        .where('district', '==', district)
        .get();
      if (!snap.empty) seeded = snap.docs.map((d) => d.data() as OfficeSeat);
    } catch (err) {
      console.error('[data] office_seats read failed, using seed:', err);
    }
  }
  const core: OfficeType[] = ['collector_dm', 'sp_district'];
  return core.map((officeType) => {
    const match = seeded.find(
      (s) => s.stateCode === stateCode && s.district === district && s.officeType === officeType,
    );
    return {
      id: `${stateCode}__${district}__${officeType}`,
      officeType,
      level: 'district' as const,
      stateCode,
      district,
      incumbent: match?.incumbent,
    };
  });
}

export async function getDatasetMeta() {
  const idx = await getIndex();
  return {
    lastUpdated: datasetLastUpdated(idx.politicians),
    source: idx.source,
    politicians: idx.politicians.length,
    states: idx.states.length,
  };
}
