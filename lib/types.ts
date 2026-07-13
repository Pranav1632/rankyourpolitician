// Shared domain types for rankyourpolitician.com
// Used by the public site (lib/, app/) and the local data manager (tools/).

export type House = 'Lok Sabha' | 'Rajya Sabha' | 'Vidhan Sabha';
export type ConstituencyType = 'PC' | 'AC';
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
   *  fact record hasn't been added yet — so an identity-only profile is still cited. */
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
  /** Bayesian-shrunk mean on a 1..5 scale (3 = neutral prior). */
  bayesian_mean: number | null;
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
  sentiment_mean: number | null;
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

/** Aggregated votes for one politician (never stores raw IPs/fingerprints). */
export interface VoteAggregate {
  politician_id: string;
  counts: Record<string, number>; // {"1":n1,...,"5":n5}
  total: number;
  sum: number;
  updated_at: string;
}
