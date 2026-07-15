// Shared domain types for rankyourpolitician.com
// Used by the public site (lib/, app/) and the local data manager (tools/).

export type House = 'Lok Sabha' | 'Rajya Sabha' | 'Vidhan Sabha' | 'Vidhan Parishad';
// PC = parliamentary (Lok Sabha), AC = assembly (Vidhan Sabha), RS = Rajya Sabha
// (state-elected, no territorial constituency), MLC = legislative council (Vidhan
// Parishad - elected by MLAs/local bodies/graduates/teachers or Governor-nominated,
// so likewise no territorial constituency).
export type ConstituencyType = 'PC' | 'AC' | 'RS' | 'MLC';
export type RankingLevel = 'national' | 'state' | 'district' | 'constituency';

/** Objective, per-member metrics that feed the Verified Performance axis. */
export type PerfMetric =
  | 'attendance_pct'
  | 'questions_asked'
  | 'debates_participated'
  | 'private_member_bills'
  | 'mplads_utilisation_pct';

export const PERF_METRICS: PerfMetric[] = [
  'attendance_pct',
  'questions_asked',
  'debates_participated',
  'private_member_bills',
  'mplads_utilisation_pct',
];

/** Human labels + "higher is better" direction + units for each metric. */
export const PERF_METRIC_META: Record<
  PerfMetric,
  { label: string; unit: string; higherIsBetter: boolean }
> = {
  attendance_pct: { label: 'Attendance', unit: '%', higherIsBetter: true },
  questions_asked: { label: 'Questions asked', unit: '', higherIsBetter: true },
  debates_participated: { label: 'Debates participated', unit: '', higherIsBetter: true },
  private_member_bills: { label: 'Private member bills', unit: '', higherIsBetter: true },
  mplads_utilisation_pct: { label: 'MPLADS funds utilised', unit: '%', higherIsBetter: true },
};

/**
 * "No citation, no claim." Every displayed datapoint is a Fact carrying its
 * source URL and the date it was retrieved. Missing data is simply absent
 * (rendered as "unavailable"), never a zero.
 */
export interface Fact {
  field_type: string;
  value: string;
  source_url: string;
  source_name: string;
  retrieved_date: string; // ISO yyyy-mm-dd
  as_of?: string; // the period/session the value refers to, if stated by source
}

export interface Politician {
  id: string; // stable slug, e.g. "north-goa-shripad-naik"
  name: string;
  name_hi?: string;
  party: string;
  house: House;
  state: string;
  stateCode: string; // ISO-ish 2-letter, e.g. "GA", "HP"
  constituencyId: string;
  constituencyName: string;
  constituencyType: ConstituencyType;
  districts: string[]; // civil districts the constituency covers
  current_position: string;
  is_minister: boolean;
  wikidata_qid?: string;
  photo_url?: string;
  photo_license?: string;
  neutral_summary?: string;
  /** Normalised numeric metrics for scoring, derived ONLY from verified facts. */
  metrics: Partial<Record<PerfMetric, number>>;
  /** Contextual facts shown but never scored (assets, cases, education...). */
  facts: Fact[];
  terms_served?: number;
  active: boolean;
  /** Citation for the core identity (name/party/constituency) when the detailed
   *  fact record hasn't been added yet - so an identity-only profile is still cited. */
  identity_source?: { url: string; name: string; retrieved_date: string };
  /** A sourced note for by-election / status context that isn't a party switch,
   *  e.g. "Won the by-election, elected on 23 November 2024." */
  party_note?: string;
  /** Ordered party-affiliation timeline (oldest first) for the current term, when
   *  the member has switched party. Each entry is the party held and the period. */
  party_history?: { party: string; from: string; until?: string; current?: boolean }[];
  /** True for auto-generated roster records; a manual `refresh-mps` may replace
   *  these, but never records that have been enriched with facts. */
  generated?: boolean;
}

export interface Constituency {
  id: string;
  type: ConstituencyType;
  name: string;
  state: string;
  stateCode: string;
  districts: string[];
  feature_id?: string; // joins to a map polygon (added with the MapLibre layer)
}

export interface PerformanceScore {
  politician_id: string;
  cohort_key: string;
  cohort_label: string;
  metric_percentiles: Partial<Record<PerfMetric, number>>; // 0..100
  composite_percentile: number | null; // null => insufficient data
  metrics_used: PerfMetric[];
  cohort_size: number;
  formula_version: string;
  computed_at: string;
}

export interface SentimentScore {
  politician_id: string;
  /**
   * Bayesian-shrunk mean on a 1..5 scale (3 = neutral prior). For ORDERING only
   * - it stops a lone 5-star vote topping the list. It must never be shown as
   * "the rating": it is not what anyone actually voted, and printing it next to
   * the vote breakdown produces a visible contradiction (five 1-star votes
   * reading as "2.3"). Display `raw_mean` and let `confidence` convey thinness.
   */
  bayesian_mean: number | null;
  /** The plain average of the votes actually cast - the number we display. */
  raw_mean: number | null;
  n_votes: number;
  distribution: Record<string, number>; // {"1":..,"5":..}
  confidence: 'none' | 'low' | 'medium' | 'high';
  flagged_unusual_activity: boolean;
  computed_at: string;
}

export interface RankingEntry {
  politician_id: string;
  name: string;
  party: string;
  constituencyName: string;
  state: string;
  stateCode: string;
  performance_percentile: number | null;
  performance_cohort: string;
  /** How many verified metrics fed the composite (0 → unranked). */
  metrics_used?: number;
  /** Bayesian-shrunk - SORT by this, never print it (see SentimentScore). */
  sentiment_mean: number | null;
  /** The plain average of votes cast - print this. */
  sentiment_raw_mean: number | null;
  sentiment_votes: number;
  photo_url?: string;
}

export interface Ranking {
  level: RankingLevel;
  geo: string; // '' national | stateCode | `${stateCode}/${district}` | constituencyId
  label: string;
  entries: RankingEntry[];
  computed_at: string;
  note?: string;
}

// ---- Appointed officials (INFO-ONLY: never rated) --------------------------
export type OfficeLevel = 'national' | 'state' | 'district' | 'city' | 'local' | 'utility';

export type OfficeType =
  | 'collector_dm'
  | 'sp_district'
  | 'mun_commissioner'
  | 'ward_officer'
  | 'cdo_ceozp'
  | 'cmo_health'
  | 'deo_education'
  | 'ee_pwd'
  | 'ee_phed'
  | 'dso_pds'
  | 'bdo'
  | 'tehsildar_sdm'
  | 'panchayat_secretary'
  | 'discom'
  | 'nhai'
  | 'chief_secretary'
  | 'dgp'
  | 'cabinet_secretary';

export type ProblemType =
  | 'roads'
  | 'water'
  | 'sanitation'
  | 'sewerage'
  | 'streetlights'
  | 'police'
  | 'health'
  | 'school'
  | 'certificates'
  | 'land'
  | 'birth_death'
  | 'electricity'
  | 'ration'
  | 'property_tax';

/** A concrete office seat in a place, optionally with the current incumbent.
 *  The SEAT (role + jurisdiction + how to escalate) is durable; the incumbent
 *  NAME churns with transfers, so it is optional and always carries an as_of. */
export interface OfficeSeat {
  id: string;
  officeType: OfficeType;
  level: OfficeLevel;
  stateCode?: string;
  district?: string;
  incumbent?: {
    name: string;
    service?: string; // IAS / IPS / State
    office_email?: string;
    office_phone?: string;
    source_url: string;
    source_name: string;
    as_of: string; // date the source was current
  };
}

/**
 * A published, citable way to actually reach an office - a helpline number or a
 * grievance/portal URL.
 *
 * Naming every DM/SP in ~600 districts is not sustainable (officers transfer
 * constantly), so most rungs of the escalation ladder have no incumbent. A
 * channel is the durable answer: it stays correct as officers change, and it is
 * what a citizen actually needs - somewhere to call, write or file. Every
 * channel carries the official source that publishes it; an uncited helpline is
 * never shown, since a wrong number in an emergency is worse than none.
 */
export type ContactTopic =
  | 'emergency' | 'police' | 'women' | 'child' | 'health' | 'ambulance'
  | 'electricity' | 'water' | 'ration' | 'senior' | 'grievance' | 'corruption'
  | 'general' | 'cyber' | 'road' | 'fire' | 'disaster';

export interface ContactChannel {
  kind: 'phone' | 'url';
  topic: ContactTopic;
  label: string;
  /** Phone: digits only ("112", "1800111555"). URL: full https URL. */
  value: string;
  scope: 'national' | 'state';
  source_url: string;
  source_name: string;
  retrieved_date: string;
  note?: string;
}

/** National + per-state channels (data/seed/contact_channels.json). */
export interface ContactChannelsFile {
  national: ContactChannel[];
  states: { stateCode: string; stateName: string; channels: ContactChannel[] }[];
}

/**
 * A district's own official website, proven live at build time. This is the
 * "place to go" when no officer is named: the district's Who's Who directory is
 * maintained by the district itself, so it names the CURRENT collector even
 * though we do not.
 */
export interface DistrictPortal {
  key: string; // `${stateCode}__${district}`
  stateCode: string;
  district: string;
  url: string;
  title?: string;
  whosWhoUrl?: string;
  contactUrl?: string;
  phone?: string;
  email?: string;
  source_url: string;
  source_name: string;
  retrieved_date: string;
  verified: 'fetched-200-name-match' | 'fetched-200-marker';
}

/** Constitutional / parliamentary offices OUTSIDE the Council of Ministers:
 *  Head of State, presiding officers and the statutory opposition leaders.
 *  Info-only (never ranked); the office is non-partisan for president/VP. */
export type ConstitutionalOfficeKey = 'president' | 'vice_president' | 'ls_speaker' | 'lop_ls' | 'lop_rs';

export interface ConstitutionalOffice {
  id: string;
  office: ConstitutionalOfficeKey;
  title: string;
  name: string;
  party?: string;
  house?: string;
  constituency?: string;
  state?: string;
  politicianId?: string; // link to a full profile if one exists in our dataset
  photo_url?: string;
  since?: string; // ISO date office was assumed
  note?: string;
  source_url: string;
  source_name: string;
  retrieved_date: string;
}

/** Central government: a member of the Union Council of Ministers. */
export type MinisterRank = 'PM' | 'Cabinet' | 'MoS-IC' | 'MoS';

export const MINISTER_RANK_LABEL: Record<MinisterRank, string> = {
  PM: 'Prime Minister',
  Cabinet: 'Cabinet Minister',
  'MoS-IC': 'Minister of State (Independent Charge)',
  MoS: 'Minister of State',
};

export interface Minister {
  id: string;
  rank: MinisterRank;
  name: string;
  party: string;
  portfolios: string[]; // ministries/departments held
  house?: string; // Lok Sabha / Rajya Sabha
  constituency?: string;
  state?: string;
  wikidata_qid?: string;
  photo_url?: string;
  politicianId?: string; // link to a full profile if one exists in our dataset
  source_url: string;
  source_name: string;
  retrieved_date: string;
  as_of?: string;
}

/** State executive: a member of a State/UT Council of Ministers. */
export type StateMinisterRank = 'CM' | 'DyCM' | 'Cabinet' | 'MoS';

export const STATE_RANK_LABEL: Record<StateMinisterRank, string> = {
  CM: 'Chief Minister',
  DyCM: 'Deputy Chief Minister',
  Cabinet: 'Cabinet Minister',
  MoS: 'Minister of State',
};

export interface StateMinister {
  id: string;
  stateCode: string;
  state: string;
  rank: StateMinisterRank;
  name: string;
  party: string;
  portfolios: string[];
  photo_url?: string;
  politicianId?: string; // link to a full profile if one exists in our dataset
  source_url?: string;
  source_name?: string;
  retrieved_date?: string;
  as_of?: string;
}

/** A State/UT government: leadership, cabinet and (appointed) Governor. */
export interface StateGovernment {
  stateCode: string;
  state: string;
  governmentStatus: 'elected' | 'presidents_rule' | 'uncertain';
  asOf?: string;
  confidence: 'high' | 'medium' | 'low';
  governor?: { name: string; title?: string; sourceUrl?: string };
  ministers: StateMinister[]; // ordered: CM, Deputy CM(s), Cabinet, MoS
  sources: string[];
}

/** Aggregated votes for one politician (never stores raw IPs/fingerprints). */
export interface VoteAggregate {
  politician_id: string;
  counts: Record<string, number>; // {"1":n1,...,"5":n5}
  total: number;
  sum: number;
  updated_at: string;
  /**
   * Rating EVENTS per UTC day, for the trending window - {"2026-07-15":{"5":3}}.
   * Every vote cast or changed counts as one event on the day it happens;
   * buckets are never decremented (a changed vote IS that day's activity, and
   * we could not know which day the earlier vote landed in anyway). The vote
   * transaction prunes keys older than TRENDING_RETENTION_DAYS, so the doc
   * stays bounded. Absent on aggregates that predate the trending feature.
   */
  daily?: Record<string, Record<string, number>>;
}

/** One row of the trending list: recent rating ACTIVITY, not a quality verdict.
 *  `recent_mean` is the plain average of the window's rating events - that is
 *  what gets displayed; the decayed score is for ordering only (never shown). */
export interface TrendingEntry {
  politician_id: string;
  name: string;
  party?: string;
  constituencyName?: string;
  state?: string;
  photo_url?: string;
  /** Rating events inside the trending window. */
  recent_votes: number;
  /** Plain average of the window's rating events (1..5). */
  recent_mean: number | null;
  /** All-time vote count, for context. */
  total_votes: number;
}
