// Server-side map geometry. We project the (compliant, Survey-of-India-conforming)
// DataMeet states GeoJSON to SVG path strings HERE, so the 460KB of geometry
// stays on the server and only tiny path strings reach the browser.
import { geoIdentity, geoPath } from 'd3-geo';
import statesGeo from '@/data/geo/india-states.json';
import { shrinkPathData } from './geo-shared';

export const MAP_W = 520;
export const MAP_H = 560;

// DataMeet ST_NM -> our 2-letter state code.
export const STATE_CODE_BY_NAME: Record<string, string> = {
  'Andaman & Nicobar': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  Assam: 'AS',
  Bihar: 'BR',
  Chandigarh: 'CH',
  Chhattisgarh: 'CG',
  'Dadra and Nagar Haveli and Daman and Diu': 'DN',
  Delhi: 'DL',
  Goa: 'GA',
  Gujarat: 'GJ',
  Haryana: 'HR',
  'Himachal Pradesh': 'HP',
  'Jammu & Kashmir': 'JK',
  Jharkhand: 'JH',
  Karnataka: 'KA',
  Kerala: 'KL',
  Ladakh: 'LA',
  Lakshadweep: 'LD',
  'Madhya Pradesh': 'MP',
  Maharashtra: 'MH',
  Manipur: 'MN',
  Meghalaya: 'ML',
  Mizoram: 'MZ',
  Nagaland: 'NL',
  Odisha: 'OD',
  Puducherry: 'PY',
  Punjab: 'PB',
  Rajasthan: 'RJ',
  Sikkim: 'SK',
  'Tamil Nadu': 'TN',
  Telangana: 'TG',
  Tripura: 'TR',
  'Uttar Pradesh': 'UP',
  Uttarakhand: 'UK',
  'West Bengal': 'WB',
};

export interface StatePath {
  code: string | null;
  name: string;
  d: string;
  cx: number;
  cy: number;
}

let cached: StatePath[] | null = null;

export function buildStatePaths(): StatePath[] {
  if (cached) return cached;
  const fc = statesGeo as unknown as GeoJSON.FeatureCollection;
  // geoIdentity is a PLANAR transform: it ignores spherical polygon-winding, so
  // (unlike geoMercator) it never inverts a fill when the source shapefile's
  // ring order differs from RFC 7946. reflectY flips lat (north = up).
  const projection = geoIdentity().reflectY(true).fitSize([MAP_W, MAP_H], fc as any);
  // Integer coordinates + ≥2px point decimation: the hero map used to be
  // ~514KB of inline SVG - invisible detail that slowed every page load.
  const path = geoPath(projection).digits(0);
  cached = fc.features.map((f: any) => {
    const name = f.properties.ST_NM as string;
    const [cx, cy] = path.centroid(f);
    return {
      code: STATE_CODE_BY_NAME[name] ?? null,
      name,
      d: shrinkPathData(path(f) || ''),
      cx: Number.isFinite(cx) ? cx : 0,
      cy: Number.isFinite(cy) ? cy : 0,
    };
  });
  return cached;
}
