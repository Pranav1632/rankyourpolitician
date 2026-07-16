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
  House,
  MetricExemptReason,
} from './types';
import {
  buildRankings,
  computePerformanceScores,
  computeSentimentScore,
} from './ranking';
import { computeTrendingSignals, trendDirection } from './trending';
import type { TrendingEntry, TopRatedEntry } from './types';
import { getDb, isFirestoreConfigured } from './firebase-admin';
import { memVoteAggregates } from './votes';
import { datasetLastUpdated } from './format';
import { MINISTER_RANK_LABEL, type MinisterRank, type Fact, type PerfMetric } from './types';
import seedPoliticians from '@/data/seed/politicians.json';
import seedConstituencies from '@/data/seed/constituencies.json';
import seedCentral from '@/data/seed/central_government.json';
import seedDistrictOfficials from '@/data/seed/district_officials.json';
import seedStateGov from '@/data/seed/state_government.json';
import seedConstitutional from '@/data/seed/constitutional_offices.json';
import seedDistrictPortals from '@/data/seed/district_portals.json';
import seedContactChannels from '@/data/seed/contact_channels.json';
import seedCriminalCases from '@/data/seed/criminal_cases.json';
import type { CriminalRecord } from './types';
import { STATE_RANK_LABEL, type ConstitutionalOffice, type ContactChannel, type ContactChannelsFile, type DistrictPortal, type Minister, type OfficeSeat, type OfficeType, type OfficeLevel, type StateGovernment, type StateMinister, type StateMinisterRank } from './types';

// Affidavit case detail, keyed by person. Seed-only (updated via
// `dm fetch-criminal-cases` + redeploy) - a person page embeds just its own
// member's slice, so pages stay static/ISR with no new runtime reads.
let criminalRecords: Map<string, CriminalRecord> | null = null;
function criminalRecordById(): Map<string, CriminalRecord> {
  return (criminalRecords ??= new Map(
    (seedCriminalCases as unknown as CriminalRecord[]).map((r) => [r.politician_id, r]),
  ));
}

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
  /** Raw live aggregates (with daily trending buckets), keyed by person id. */
  voteAggregates: Map<string, VoteAggregate>;
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

// ---- In-process TTL memoisation ---------------------------------------------
// Every Firestore collection the site reads at runtime goes through one of
// these memos, so the worst case is one load per collection per TTL per warm
// instance - NOT per render. Without this, a crawler sweeping the ~6k person
// pages cost ~200 reads per page (uncached central/state government scans,
// doubled by generateMetadata) - millions of billed reads with zero real users.
// The PROMISE is cached, not the resolved value, so a burst of concurrent
// renders on a cold instance shares a single load instead of stampeding the
// database. Failed loads are evicted so the next call retries.
function ttlCache<T>(ttlMs: number | (() => number), load: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let pending: Promise<T> | null = null;
  return () => {
    const ttl = typeof ttlMs === 'number' ? ttlMs : ttlMs();
    if (pending && Date.now() - at < ttl) return pending;
    at = Date.now();
    const p = load();
    pending = p;
    p.catch(() => {
      if (pending === p) pending = null;
    });
    return p;
  };
}

// Government/office collections only change when the data manager publishes;
// vote aggregates drive the visible scores, so they refresh more often.
const STATIC_TTL_MS = 30 * 60_000;
const VOTES_TTL_MS = 5 * 60_000;
// Credential-less mode has no Firestore to protect - the index's only
// time-varying input is the in-process vote store - so keep it near-fresh: a
// locally cast vote reaches trending/rankings in seconds, not five minutes.
const SEED_TTL_MS = 5_000;

/**
 * Live vote aggregates - the only frequently-refreshed Firestore read.
 * Politician/constituency data is static between deploys and is served from the
 * committed seed. Returns empty during `next build` (getDb() is null) or on any
 * read error, degrading gracefully to "no ratings".
 */
const loadVoteAggregates = ttlCache(VOTES_TTL_MS, async (): Promise<Map<string, VoteAggregate>> => {
  const m = new Map<string, VoteAggregate>();
  const db = getDb();
  if (!db) return m;
  try {
    const snap = await db.collection('vote_aggregates').get();
    snap.forEach((d) => m.set(d.id, d.data() as VoteAggregate));
  } catch (err) {
    console.error('[data] vote_aggregates read failed, showing no ratings:', err);
  }
  return m;
});

function loadFromSeed(): Dataset {
  return {
    politicians: seedPoliticians as unknown as Politician[],
    constituencies: seedConstituencies as unknown as Constituency[],
    voteAggregates: new Map(),
    source: 'seed',
  };
}

async function loadDataset(): Promise<Dataset> {
  // Politician/constituency data always comes from the committed seed (the same
  // snapshot we publish, updated via `dm refresh-mps` + redeploy). Only the
  // dynamic vote aggregates are read live from Firestore at runtime. Without
  // Firestore (credential-less dev) they come from the in-process vote store,
  // so voting, trending and live rankings all work with zero setup.
  const db = getDb();
  return {
    ...loadFromSeed(),
    voteAggregates: db ? await loadVoteAggregates() : memVoteAggregates(),
    source: db ? 'firestore' : 'seed',
  };
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
    voteAggregates: ds.voteAggregates,
    states: [...stateAgg.entries()]
      .map(([stateCode, v]) => ({ stateCode, state: v.state, count: v.count }))
      .sort((a, b) => a.state.localeCompare(b.state)),
    source: ds.source,
    builtAt: new Date().toISOString(),
  };
}

// Memo aligned with the vote-aggregates TTL: the index's only time-varying
// input is the aggregates map, so rebuilding more often than it refreshes is
// pure wasted CPU (percentiles + rankings over ~6k politicians). ISR caches
// the rendered page on top of this; vote updates surface within VOTES_TTL_MS.
const getIndexCached = ttlCache(
  // The TTL exists to bound Firestore reads; without Firestore it only delays
  // locally cast votes, so it drops to seconds (decided per call - a dev
  // server can gain credentials only by restarting, but it costs nothing).
  () => (isFirestoreConfigured() ? VOTES_TTL_MS : SEED_TTL_MS),
  async () => buildIndex(await loadDataset()),
);

export async function getIndex(): Promise<Index> {
  return getIndexCached();
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
    // Blank names guard: a "" district would prerender an unroutable
    // /district/XX/ page and a nameless dropdown option.
    if (p.stateCode === stateCode) p.districts.forEach((d) => d?.trim() && set.add(d));
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
  portfolios: string[]; // all departments this person runs (union or state)
  ministerRank?: MinisterRank;
  ministerRankLabel?: string;
  stateRank?: StateMinisterRank; // set for a State/UT Council-of-Ministers member
  govScope?: 'union' | 'state';
  neutral_summary?: string;
  terms_served?: number;
  facts: Fact[];
  /** Case-by-case affidavit detail behind the criminal_cases_declared fact. */
  criminal_record?: CriminalRecord;
  metrics: Partial<Record<PerfMetric, number>>;
  /** Metrics the house keeps no record of for this member (minister / presiding
   *  officer / LoP) - rendered as "exempt", never as 0 or "unavailable". */
  metrics_exempt?: Partial<Record<PerfMetric, MetricExemptReason>>;
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
    // A linked Council-of-Ministers role (CM / Dy CM / state minister) belongs on
    // the real profile too - otherwise the person is "just an MLA" here and their
    // executive office only lives on a disconnected stub.
    const stateRoles = (await allStateMinisters()).filter((sm) => sm.politicianId === id);
    const allRoles = [...roles, ...stateRoles];
    const portfolios = [...new Set(allRoles.flatMap((r) => r.portfolios))];
    const extraSources = allRoles.filter((r) => r.source_url).map((r) => [r.source_url, r.source_name] as [string, string]);
    // Constitutional/parliamentary office (Speaker, Leader of the Opposition…)
    // - lead with it so e.g. the LoP isn't shown as "just an MP".
    const constRoles = (seedConstitutional as unknown as ConstitutionalOffice[]).filter((o) => o.politicianId === id);
    if (constRoles.length) extraSources.push(...constRoles.map((o) => [o.source_url, o.source_name] as [string, string]));
    const sr = stateRoles[0];
    const statePosition = sr
      ? sr.rank === 'CM' ? `Chief Minister of ${sr.state}`
        : sr.rank === 'DyCM' ? `Deputy Chief Minister of ${sr.state}`
        : `${STATE_RANK_LABEL[sr.rank]}, ${sr.state}`
      : undefined;
    const constPosition = constRoles[0]?.title;
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
        is_minister: p.is_minister || allRoles.length > 0,
        is_pm: roles.some((r) => r.rank === 'PM'),
        // Lead with the executive office (Chief Minister…) when they hold one,
        // then a constitutional office (Speaker / Leader of the Opposition).
        current_position: statePosition || constPosition || p.current_position,
        portfolios,
        ministerRank: roles[0]?.rank,
        ministerRankLabel: roles[0] ? MINISTER_RANK_LABEL[roles[0].rank] : sr ? STATE_RANK_LABEL[sr.rank] : undefined,
        stateRank: sr?.rank,
        govScope: sr ? 'state' : undefined,
        neutral_summary: p.neutral_summary,
        terms_served: p.terms_served,
        facts: p.facts,
        criminal_record: criminalRecordById().get(id),
        metrics: p.metrics,
        metrics_exempt: p.metrics_exempt,
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

  // State / UT Council-of-Ministers member (CM, Deputy CM, state minister).
  const stateMins = await allStateMinisters();
  const sm = stateMins.find((x) => x.id === id);
  if (sm) {
    if (sm.politicianId && idx.politicianById.get(sm.politicianId)) return { redirectTo: sm.politicianId };
    const roles = stateMins.filter((x) => x.id === id);
    const portfolios = [...new Set(roles.flatMap((r) => r.portfolios))];
    const position =
      sm.rank === 'CM' ? `Chief Minister of ${sm.state}`
      : sm.rank === 'DyCM' ? `Deputy Chief Minister of ${sm.state}`
      : `${STATE_RANK_LABEL[sm.rank]}, ${sm.state}`;
    return {
      person: {
        kind: 'elected' as const,
        id: sm.id,
        name: sm.name,
        party: sm.party,
        house: 'Vidhan Sabha',
        state: sm.state,
        stateCode: sm.stateCode,
        districts: [],
        photo_url: sm.photo_url,
        is_minister: true,
        is_pm: false,
        current_position: position,
        portfolios,
        stateRank: sm.rank,
        govScope: 'state',
        ministerRankLabel: STATE_RANK_LABEL[sm.rank],
        neutral_summary: `${sm.name} is the ${position} (${sm.party}).`,
        facts: [],
        metrics: {},
        performance: null,
        hasRecord: false,
        sources: sm.source_url ? [[sm.source_url, sm.source_name || 'Source']] : [],
      },
    };
  }

  // Appointed official (incumbent of an office seat) - INFO-ONLY person.
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

const allOfficeSeats = ttlCache(STATIC_TTL_MS, async (): Promise<OfficeSeat[]> => {
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
});

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
  for (const sm of await allStateMinisters()) if (!sm.politicianId) ids.add(sm.id);
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

/** Sentiment for one person, served from the TTL-cached aggregates so a
 *  person-page render costs zero extra Firestore reads. The vote API returns
 *  the fresh score directly after a vote, so this staleness is invisible to
 *  the voter. */
export async function getPersonSentiment(id: string): Promise<SentimentScore> {
  const idx = await getIndex();
  return idx.sentiment.get(id) ?? computeSentimentScore(id, undefined);
}

/** Live ratings for every leader with at least one vote, as compact rows of
 *  [bayesian_mean, raw_mean, n_votes] keyed by person id. RankingList merges
 *  these into whatever entries it was given - static rankings.json rows and
 *  ISR-baked state/district/area lists alike - client-side (the Bayesian
 *  value orders the list, the raw mean is what gets displayed). Served from
 *  the TTL-cached aggregates - zero extra Firestore reads - and only rated
 *  leaders are included, so the payload stays tiny. */
export async function getAllRatings(): Promise<Record<string, [number, number, number]>> {
  const idx = await getIndex();
  const out: Record<string, [number, number, number]> = {};
  for (const [id, s] of idx.sentiment) {
    if (s.n_votes > 0 && s.bayesian_mean != null && s.raw_mean != null) {
      out[id] = [s.bayesian_mean, s.raw_mean, s.n_votes];
    }
  }
  return out;
}

/**
 * Trending leaders: most rating activity in the last week, decayed toward
 * today (see lib/trending.ts for the exact rules). Derived entirely from the
 * TTL-cached aggregates the index already loads - zero extra Firestore reads.
 * Entries are joined to the politician index; a person rated on a
 * minister-only profile (no linked MP/MLA record) is resolved from the
 * government rosters. Ids that resolve to no one are skipped - missing beats
 * wrong.
 */
/** Roster lookup for rated ids with no politician record (CM / minister stubs
 *  rated from government pages): central council first, then state ministers.
 *  Built per call from the TTL-cached rosters - call it lazily, only when an
 *  id actually misses the politician index. */
async function ministerRosterById(): Promise<
  Map<string, { name: string; party?: string; state?: string; constituency?: string; photo_url?: string }>
> {
  const byId = new Map<string, { name: string; party?: string; state?: string; constituency?: string; photo_url?: string }>();
  for (const m of await getCentralGovernment()) {
    byId.set(m.politicianId || m.id, { name: m.name, party: m.party, state: m.state, constituency: m.constituency, photo_url: m.photo_url });
  }
  for (const sm of await allStateMinisters()) {
    const key = sm.politicianId || sm.id;
    if (!byId.has(key)) byId.set(key, { name: sm.name, party: sm.party, state: sm.state, photo_url: sm.photo_url });
  }
  return byId;
}

export interface TrendingScope {
  /** 2-letter state code - the /state/[state] URL segment. */
  stateCode: string;
  /** District name, matched the same way as getDistrictView (normSimple). */
  district?: string;
}

export async function getTrending(limit = 5, scope?: TrendingScope): Promise<TrendingEntry[]> {
  const idx = await getIndex();

  // Geo scoping filters the already-cached aggregates BEFORE scoring - a few
  // map lookups per rated leader, zero extra Firestore reads. District links
  // exist only on politician records; for a state scope, CM/minister stubs
  // rated from government pages are admitted via the state's roster ids
  // (their aggregates have no politician record to carry a stateCode).
  let aggs: Iterable<VoteAggregate> = idx.voteAggregates.values();
  if (scope) {
    const wantDistrict = scope.district ? normSimple(scope.district) : null;
    const stubIds = new Set<string>();
    if (!wantDistrict) {
      const gov = (await loadStateGovernments()).find((g) => g.stateCode === scope.stateCode);
      for (const m of gov?.ministers ?? []) stubIds.add(m.politicianId || m.id);
    }
    aggs = [...aggs].filter((a) => {
      const p = idx.politicianById.get(a.politician_id);
      if (!p) return stubIds.has(a.politician_id);
      if (p.stateCode !== scope.stateCode) return false;
      return !wantDistrict || p.districts.some((d) => normSimple(d) === wantDistrict);
    });
  }

  const signals = computeTrendingSignals(aggs);

  // Lazily built roster lookup for the rare non-MP case (CM / minister stubs).
  let rosterById: Awaited<ReturnType<typeof ministerRosterById>> | null = null;
  const loadRosters = async () => (rosterById ??= await ministerRosterById());

  const out: TrendingEntry[] = [];
  for (const s of signals) {
    if (out.length >= limit) break;
    // The displayed rating is the leader's REAL one - the all-time plain
    // average of standing votes, exactly what their profile shows - not the
    // mean of this week's events (re-votes make those diverge).
    const agg = idx.voteAggregates.get(s.politician_id);
    const total = agg?.total ?? 0;
    const rating_mean = agg && agg.total > 0 ? Math.round((agg.sum / agg.total) * 100) / 100 : null;
    // Direction of the week's incoming ratings vs that all-time mean - both
    // numbers are already in hand, so the arrow costs nothing (lib/trending.ts).
    const direction = trendDirection(s.recent_mean, rating_mean);
    const p = idx.politicianById.get(s.politician_id);
    if (p) {
      out.push({
        politician_id: p.id,
        name: p.name,
        party: p.party,
        constituencyName: p.constituencyName,
        state: p.state,
        photo_url: p.photo_url,
        recent_votes: s.recent_votes,
        ...(direction ? { direction } : {}),
        rating_mean,
        total_votes: total,
      });
      continue;
    }
    const m = (await loadRosters()).get(s.politician_id);
    if (m) {
      out.push({
        politician_id: s.politician_id,
        name: m.name,
        party: m.party,
        constituencyName: m.constituency,
        state: m.state,
        photo_url: m.photo_url,
        recent_votes: s.recent_votes,
        ...(direction ? { direction } : {}),
        rating_mean,
        total_votes: total,
      });
    }
  }
  return out;
}

/**
 * Top-rated leaders: highest PUBLIC rating among everyone with at least one
 * vote - the user-vote axis, fully separate from the verified-performance
 * ranking. The Bayesian mean orders the list (thin samples shrink toward
 * neutral, so a single 5-star vote cannot outrank a well-voted 4.5) and is
 * never returned; rating_mean is the plain average the profile shows. Same
 * zero-extra-reads pattern as getTrending: served from the TTL-cached
 * aggregates, ids that resolve to no known person are skipped.
 */
export async function getTopRated(limit = 5): Promise<TopRatedEntry[]> {
  const idx = await getIndex();
  const rated = [...idx.sentiment.values()]
    .filter((s) => s.n_votes > 0 && s.bayesian_mean != null && s.raw_mean != null)
    .sort(
      (a, b) =>
        b.bayesian_mean! - a.bayesian_mean! ||
        b.n_votes - a.n_votes ||
        a.politician_id.localeCompare(b.politician_id),
    );

  let rosterById: Awaited<ReturnType<typeof ministerRosterById>> | null = null;
  const out: TopRatedEntry[] = [];
  for (const s of rated) {
    if (out.length >= limit) break;
    const p = idx.politicianById.get(s.politician_id);
    if (p) {
      out.push({
        politician_id: p.id,
        name: p.name,
        party: p.party,
        constituencyName: p.constituencyName,
        state: p.state,
        photo_url: p.photo_url,
        rating_mean: s.raw_mean!,
        total_votes: s.n_votes,
      });
      continue;
    }
    const m = (rosterById ??= await ministerRosterById()).get(s.politician_id);
    if (m) {
      out.push({
        politician_id: s.politician_id,
        name: m.name,
        party: m.party,
        constituencyName: m.constituency,
        state: m.state,
        photo_url: m.photo_url,
        rating_mean: s.raw_mean!,
        total_votes: s.n_votes,
      });
    }
  }
  return out;
}

/** Fill a minister record's missing photo from its linked politician profile -
 *  minister rows come from council lists (no images), but the politician record
 *  usually has a Commons photo. Without this, the PM/CM cards show initials
 *  even when we have the person's photo. */
async function joinMinisterPhotos<T extends { politicianId?: string; photo_url?: string }>(ms: T[]): Promise<T[]> {
  const idx = await getIndex();
  return ms.map((m) => {
    if (m.photo_url || !m.politicianId) return m;
    const p = idx.politicianById.get(m.politicianId);
    return p?.photo_url ? { ...m, photo_url: p.photo_url } : m;
  });
}

/** Constitutional offices (President, VP, LS Speaker, Leaders of the
 *  Opposition) - committed seed only, photos joined from linked profiles. */
export async function getConstitutionalOffices(): Promise<ConstitutionalOffice[]> {
  return joinMinisterPhotos(seedConstitutional as unknown as ConstitutionalOffice[]);
}

const loadCentralGovernment = ttlCache(STATIC_TTL_MS, async (): Promise<Minister[]> => {
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
});

export async function getCentralGovernment(): Promise<Minister[]> {
  // Photos are joined OUTSIDE the memo: the join depends on the politician
  // index, which has its own cache - and it's a cheap in-memory map lookup.
  return joinMinisterPhotos(await loadCentralGovernment());
}

export async function getMinister(id: string): Promise<Minister | null> {
  return (await getCentralGovernment()).find((m) => m.id === id) ?? null;
}

const loadStateGovernments = ttlCache(STATIC_TTL_MS, async (): Promise<StateGovernment[]> => {
  const db = getDb();
  if (db) {
    try {
      const snap = await db.collection('state_government').get();
      if (!snap.empty) return snap.docs.map((d) => d.data() as StateGovernment);
    } catch (err) {
      console.error('[data] state_government read failed, using seed:', err);
    }
  }
  return seedStateGov as unknown as StateGovernment[];
});

export async function getStateGovernments(): Promise<StateGovernment[]> {
  const gs = await loadStateGovernments();
  return Promise.all(gs.map(async (g) => ({ ...g, ministers: await joinMinisterPhotos(g.ministers || []) })));
}

export async function getStateGovernment(stateCode: string): Promise<StateGovernment | null> {
  return (await getStateGovernments()).find((g) => g.stateCode === stateCode) ?? null;
}

async function allStateMinisters(): Promise<StateMinister[]> {
  return (await getStateGovernments()).flatMap((g) => g.ministers);
}

/**
 * The district's own official website (proven live when the seed was generated).
 * This is what the ladder offers when we cannot name the DM/SP - the district's
 * Who's Who page names whoever currently holds the post, so it stays right as
 * officers transfer. See tools/data-manager/discover-district-portals.ts.
 */
export async function getDistrictPortal(stateCode: string, district: string): Promise<DistrictPortal | undefined> {
  const portals = seedDistrictPortals as unknown as Record<string, DistrictPortal>;
  return portals[`${stateCode}__${district}`];
}

/**
 * Published helplines/grievance portals reachable from this state: the state's
 * own first (more actionable), then the national ones that work everywhere.
 */
export async function getContactChannels(stateCode: string): Promise<ContactChannel[]> {
  const file = seedContactChannels as unknown as ContactChannelsFile;
  const st = (file.states ?? []).find((s) => s.stateCode === stateCode);
  return [...(st?.channels ?? []), ...(file.national ?? [])];
}

/** The key appointed offices for a district (durable roles), with the current
 *  incumbent merged in where we have a cited one. Always returns the 2 core
 *  seats (Collector/DM + SP) so the "who to approach" is shown even without a name. */
export async function getDistrictOfficials(stateCode: string, district: string): Promise<OfficeSeat[]> {
  // Filter the TTL-cached full collection in memory - a per-district Firestore
  // query per district-page render (~780 districts on ISR) adds up fast.
  const seeded = await allOfficeSeats();
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

// ---- Geography views (state / district / constituency pages) ---------------

const normSimple = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

/** Party seat counts for a list of politicians, largest first. */
export function partyComposition(list: Politician[], top = 8): { segments: { label: string; count: number }[]; total: number } {
  const counts = new Map<string, number>();
  for (const p of list) {
    const short = p.party.match(/\(([^)]+)\)\s*$/)?.[1] ?? p.party;
    counts.set(short, (counts.get(short) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const segments = sorted.slice(0, top).map(([label, count]) => ({ label, count }));
  const rest = sorted.slice(top).reduce((s, [, c]) => s + c, 0);
  if (rest > 0) segments.push({ label: 'Others', count: rest });
  return { segments, total: list.length };
}

export interface StateView {
  stateCode: string;
  state: string;
  total: number;
  byHouse: { house: House; count: number }[];
  /** Vidhan Sabha composition (party seat counts) - factual, neutral display. */
  assemblyComposition: { segments: { label: string; count: number }[]; total: number } | null;
  /** district → number of representatives linked to it (for the map choropleth). */
  districtCounts: { district: string; mps: number; mlas: number }[];
  constituencyCounts: { PC: number; AC: number; RS: number; MLC: number };
}

export async function getStateView(stateCode: string): Promise<StateView | null> {
  const idx = await getIndex();
  const info = idx.states.find((s) => s.stateCode === stateCode);
  if (!info) return null;
  const inState = idx.politicians.filter((p) => p.stateCode === stateCode);

  const houseOrder: House[] = ['Lok Sabha', 'Rajya Sabha', 'Vidhan Sabha', 'Vidhan Parishad'];
  const byHouse = houseOrder
    .map((house) => ({ house, count: inState.filter((p) => p.house === house).length }))
    .filter((x) => x.count > 0);

  const mlas = inState.filter((p) => p.house === 'Vidhan Sabha');
  const assemblyComposition = mlas.length > 0 ? partyComposition(mlas) : null;

  const dc = new Map<string, { mps: number; mlas: number }>();
  for (const p of inState) {
    for (const d of p.districts) {
      const cur = dc.get(d) ?? { mps: 0, mlas: 0 };
      if (p.constituencyType === 'PC') cur.mps++;
      if (p.constituencyType === 'AC') cur.mlas++;
      dc.set(d, cur);
    }
  }
  const districtCounts = [...dc.entries()]
    .map(([district, v]) => ({ district, ...v }))
    .sort((a, b) => a.district.localeCompare(b.district));

  const constituencyCounts = { PC: 0, AC: 0, RS: 0, MLC: 0 };
  for (const c of idx.constituencies) {
    if (c.stateCode === stateCode) constituencyCounts[c.type]++;
  }

  return { stateCode, state: info.state, total: inState.length, byHouse, assemblyComposition, districtCounts, constituencyCounts };
}

export interface DistrictView {
  stateCode: string;
  state: string;
  /** Canonical display name (as stored in the seed / map). */
  district: string;
  mps: Politician[];
  mlas: Politician[];
  /** Constituencies overlapping this district. */
  constituencies: Constituency[];
  neighbours: string[]; // other districts of the state (for quick nav)
}

export async function getDistrictView(stateCode: string, districtParam: string): Promise<DistrictView | null> {
  const idx = await getIndex();
  const info = idx.states.find((s) => s.stateCode === stateCode);
  if (!info) return null;
  const want = normSimple(districtParam);

  const all = await getDistrictsInState(stateCode);
  const district = all.find((d) => normSimple(d) === want) ?? districtParam;

  const inDistrict = idx.politicians.filter(
    (p) => p.stateCode === stateCode && p.districts.some((d) => normSimple(d) === want),
  );
  const byName = (a: Politician, b: Politician) => a.constituencyName.localeCompare(b.constituencyName);
  const mps = inDistrict.filter((p) => p.constituencyType === 'PC').sort(byName);
  const mlas = inDistrict.filter((p) => p.constituencyType === 'AC').sort(byName);

  const constituencies = idx.constituencies
    .filter((c) => c.stateCode === stateCode && c.districts.some((d) => normSimple(d) === want))
    .sort((a, b) => a.name.localeCompare(b.name));

  const neighbours = all.filter((d) => normSimple(d) !== want);

  if (mps.length === 0 && mlas.length === 0 && constituencies.length === 0 && !all.some((d) => normSimple(d) === want)) {
    return null;
  }
  return { stateCode, state: info.state, district, mps, mlas, constituencies, neighbours };
}

export interface ConstituencyView {
  constituency: Constituency;
  representatives: Politician[];
  /** Other constituencies sharing a district with this one (same type first). */
  siblings: Constituency[];
}

export async function getConstituencyView(id: string): Promise<ConstituencyView | null> {
  const idx = await getIndex();
  const c = idx.constituencyById.get(id);
  if (!c) return null;
  const representatives = idx.politicians.filter((p) => p.constituencyId === id);
  const dset = new Set(c.districts.map(normSimple));
  const siblings =
    dset.size > 0
      ? idx.constituencies
          .filter((x) => x.id !== id && x.stateCode === c.stateCode && x.districts.some((d) => dset.has(normSimple(d))))
          .sort((a, b) => (a.type === c.type ? -1 : 1) - (b.type === c.type ? -1 : 1) || a.name.localeCompare(b.name))
          .slice(0, 24)
      : [];
  return { constituency: c, representatives, siblings };
}

export interface NationalStats {
  politicians: number;
  lokSabha: number;
  rajyaSabha: number;
  mlas: number;
  mlcs: number;
  states: number;
  districts: number;
  constituencies: number;
  lokSabhaComposition: { segments: { label: string; count: number }[]; total: number };
}

export async function getNationalStats(): Promise<NationalStats> {
  const idx = await getIndex();
  const by = (h: House) => idx.politicians.filter((p) => p.house === h);
  const ls = by('Lok Sabha');
  const districtSet = new Set<string>();
  for (const p of idx.politicians) for (const d of p.districts) districtSet.add(`${p.stateCode}|${d}`);
  return {
    politicians: idx.politicians.length,
    lokSabha: ls.length,
    rajyaSabha: by('Rajya Sabha').length,
    mlas: by('Vidhan Sabha').length,
    mlcs: by('Vidhan Parishad').length,
    // "NOM" groups the President's nominees to the Rajya Sabha - not a geography.
    states: idx.states.filter((s) => s.stateCode !== 'NOM').length,
    districts: districtSet.size,
    constituencies: idx.constituencies.length,
    lokSabhaComposition: partyComposition(ls),
  };
}
