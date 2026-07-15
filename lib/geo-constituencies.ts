// Constituency-level geometry: assembly seats (2008 delimitation) and Lok
// Sabha seats (2019 file). Server-only; used for the "where is this area"
// mini-maps. Constituencies from newer delimitations (Assam 2023, J&K 2022)
// may have no polygon - callers must handle null and degrade honestly.
import acsGeo from '@/data/geo/india-acs.json';
import pcsGeo from '@/data/geo/india-pcs.json';
import statesGeo from '@/data/geo/india-states.json';
import { STATE_CODE_BY_NAME } from './geo';
import { geoIdentity, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { normGeoName } from './geo-shared';

interface AcFeature {
  properties: { ac: string; d: string; pc: string; s: string };
  geometry: unknown;
}
interface PcFeature {
  properties: { pc: string; s: string; hi?: string };
  geometry: unknown;
}

const acs = (acsGeo as unknown as { features: AcFeature[] }).features;
const pcs = (pcsGeo as unknown as { features: PcFeature[] }).features;

let acIndex: Map<string, AcFeature> | null = null;
let pcIndex: Map<string, PcFeature> | null = null;
function key(stateCode: string, name: string): string {
  return `${stateCode}|${normGeoName(name)}`;
}
function indexes() {
  if (!acIndex) {
    acIndex = new Map();
    for (const f of acs) acIndex.set(key(f.properties.s, f.properties.ac), f);
    pcIndex = new Map();
    for (const f of pcs) pcIndex.set(key(f.properties.s, f.properties.pc), f);
  }
  return { acIndex: acIndex!, pcIndex: pcIndex! };
}

export interface SpotMap {
  /** State silhouette path. */
  outline: string;
  /** The constituency polygon, projected in the same frame. */
  spot: string;
  spotCx: number;
  spotCy: number;
  w: number;
  h: number;
}

const stateFeature = new Map<string, unknown>();
function getStateFeature(stateCode: string): unknown | null {
  if (stateFeature.size === 0) {
    for (const f of (statesGeo as unknown as { features: { properties: { ST_NM: string } }[] }).features) {
      const code = STATE_CODE_BY_NAME[f.properties.ST_NM];
      if (code) stateFeature.set(code, f);
    }
  }
  return stateFeature.get(stateCode) ?? null;
}

const spotCache = new Map<string, SpotMap | null>();

/** "Where in the state is this seat" mini-map: state outline + highlighted
 *  constituency. Returns null when we have no polygon for the seat. */
export function buildSpotMap(
  stateCode: string,
  type: 'PC' | 'AC',
  consName: string,
  width = 300,
): SpotMap | null {
  const ck = `${type}|${stateCode}|${normGeoName(consName)}|${width}`;
  if (spotCache.has(ck)) return spotCache.get(ck)!;

  const { acIndex, pcIndex } = indexes();
  const feat = type === 'AC' ? acIndex.get(key(stateCode, consName)) : pcIndex.get(key(stateCode, consName));
  const state = getStateFeature(stateCode);
  let out: SpotMap | null = null;
  if (feat && state) {
    // (fitWidth exists on geoIdentity at runtime; @types/d3-geo omits it.)
    const projection = (geoIdentity().reflectY(true) as any).fitWidth(width, state as GeoPermissibleObjects);
    const path = geoPath(projection);
    const [[, y0], [, y1]] = path.bounds(state as GeoPermissibleObjects);
    const [cx, cy] = path.centroid(feat as unknown as GeoPermissibleObjects);
    out = {
      outline: path(state as GeoPermissibleObjects) || '',
      spot: path(feat as unknown as GeoPermissibleObjects) || '',
      spotCx: Number.isFinite(cx) ? cx : 0,
      spotCy: Number.isFinite(cy) ? cy : 0,
      w: width,
      h: Math.ceil(y1 - y0) + 2,
    };
  }
  spotCache.set(ck, out);
  return out;
}
