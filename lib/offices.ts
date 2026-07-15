// Durable, person-independent accountability map: which OFFICE handles which
// problem, and how to escalate. This stays correct even when an incumbent's
// name goes stale. Human-readable role text lives in i18n (offices.*, problems.*).
import type { OfficeType, OfficeLevel, ProblemType } from './types';
import type { IconName } from '@/components/Icon';

export const OFFICE_META: Record<OfficeType, { level: OfficeLevel; icon: IconName }> = {
  collector_dm: { level: 'district', icon: 'shield' },
  sp_district: { level: 'district', icon: 'shield' },
  mun_commissioner: { level: 'city', icon: 'home' },
  ward_officer: { level: 'city', icon: 'pin' },
  cdo_ceozp: { level: 'district', icon: 'people' },
  cmo_health: { level: 'district', icon: 'shield' },
  deo_education: { level: 'district', icon: 'cap' },
  ee_pwd: { level: 'district', icon: 'law' },
  ee_phed: { level: 'district', icon: 'law' },
  dso_pds: { level: 'district', icon: 'wallet' },
  bdo: { level: 'local', icon: 'people' },
  tehsildar_sdm: { level: 'local', icon: 'law' },
  panchayat_secretary: { level: 'local', icon: 'home' },
  discom: { level: 'utility', icon: 'sparkle' },
  nhai: { level: 'national', icon: 'law' },
  chief_secretary: { level: 'state', icon: 'flag' },
  dgp: { level: 'state', icon: 'shield' },
  cabinet_secretary: { level: 'national', icon: 'parliament' },
};

export const PROBLEM_META: Record<ProblemType, { icon: IconName }> = {
  roads: { icon: 'law' },
  water: { icon: 'sparkle' },
  sanitation: { icon: 'home' },
  sewerage: { icon: 'home' },
  streetlights: { icon: 'sparkle' },
  police: { icon: 'shield' },
  health: { icon: 'shield' },
  school: { icon: 'cap' },
  certificates: { icon: 'law' },
  land: { icon: 'pin' },
  birth_death: { icon: 'calendar' },
  electricity: { icon: 'sparkle' },
  ration: { icon: 'wallet' },
  property_tax: { icon: 'wallet' },
};

export const PROBLEMS: ProblemType[] = [
  'roads', 'water', 'sanitation', 'streetlights', 'police', 'health',
  'school', 'certificates', 'land', 'birth_death', 'electricity', 'ration',
  'sewerage', 'property_tax',
];

/** problem -> ordered responsible offices, split by urban vs rural area. */
export const PROBLEM_ROUTES: Record<ProblemType, { urban: OfficeType[]; rural: OfficeType[] }> = {
  roads: { urban: ['ward_officer', 'mun_commissioner'], rural: ['bdo', 'ee_pwd'] },
  water: { urban: ['ward_officer', 'mun_commissioner'], rural: ['ee_phed', 'panchayat_secretary'] },
  sanitation: { urban: ['ward_officer', 'mun_commissioner'], rural: ['panchayat_secretary', 'bdo'] },
  sewerage: { urban: ['ward_officer', 'mun_commissioner'], rural: ['panchayat_secretary'] },
  streetlights: { urban: ['ward_officer', 'mun_commissioner'], rural: ['panchayat_secretary'] },
  police: { urban: ['sp_district', 'collector_dm'], rural: ['sp_district', 'collector_dm'] },
  health: { urban: ['cmo_health'], rural: ['cmo_health'] },
  school: { urban: ['deo_education'], rural: ['deo_education'] },
  certificates: { urban: ['mun_commissioner', 'collector_dm'], rural: ['tehsildar_sdm', 'collector_dm'] },
  land: { urban: ['tehsildar_sdm', 'collector_dm'], rural: ['tehsildar_sdm', 'collector_dm'] },
  birth_death: { urban: ['mun_commissioner'], rural: ['panchayat_secretary'] },
  electricity: { urban: ['discom'], rural: ['discom'] },
  ration: { urban: ['dso_pds', 'collector_dm'], rural: ['dso_pds', 'collector_dm'] },
  property_tax: { urban: ['ward_officer', 'mun_commissioner'], rural: ['panchayat_secretary'] },
};

/** National grievance portal (CPGRAMS) - the universal escalation backstop. */
export const CPGRAMS_URL = 'https://pgportal.gov.in/';

/** The elected representative you can also press on, by area type. */
export const PARALLEL_LEVER: Record<'urban' | 'rural', 'councillor' | 'panchayat'> = {
  urban: 'councillor',
  rural: 'panchayat',
};
