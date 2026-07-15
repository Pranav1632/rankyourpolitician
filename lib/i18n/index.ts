// Tiny i18n core. English is the base dictionary; a locale file deep-overrides
// it, so any missing key automatically falls back to English. Works on both
// server (loadMessages) and client (dict passed via provider).
import en from './messages/en.json';

export type Dict = Record<string, any>;

function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T extends Dict>(base: T, override: Dict): T {
  const out: Dict = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

function getPath(dict: Dict, path: string): unknown {
  return path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), dict);
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

/** Translate a string key. Falls back to the key path if truly missing. */
export function t(dict: Dict, path: string, vars?: Record<string, string | number>): string {
  const v = getPath(dict, path);
  if (typeof v === 'string') return interpolate(v, vars);
  if (v == null) return path;
  return String(v);
}

/** Translate an array-valued key (e.g. a list of responsibilities). */
export function tArr(dict: Dict, path: string, vars?: Record<string, string | number>): string[] {
  const v = getPath(dict, path);
  if (Array.isArray(v)) return v.map((s) => (typeof s === 'string' ? interpolate(s, vars) : String(s)));
  return [];
}

export const EN: Dict = en as Dict;

// Merged dictionaries are immutable per deploy, so cache them per locale:
// without this every server render of a non-English page re-runs the deep
// merge over the full message tree.
const mergedCache = new Map<string, Dict>();

/** Load a merged dictionary for a locale (server-side). */
export async function loadMessages(locale: string): Promise<Dict> {
  if (!locale || locale === 'en') return EN;
  const cached = mergedCache.get(locale);
  if (cached) return cached;
  let dict: Dict;
  try {
    const mod = await import(`./messages/${locale}.json`);
    dict = deepMerge(EN, (mod.default ?? mod) as Dict);
  } catch {
    dict = EN; // not translated yet → English
  }
  mergedCache.set(locale, dict);
  return dict;
}
