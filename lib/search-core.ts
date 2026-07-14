// Isomorphic search over the prebuilt static index (public/search-index.json).
// Pure functions — no fs, no fetch — usable from both server and client.
// The index format is defined by tools/build-search-index.ts.

export interface SearchIndexFile {
  v: 1;
  builtAt: string;
  states: [string, string][]; // [code, name]
  people: (string | undefined)[][]; // [id, name, partyShort, place, stateCode, role, nameHi?, photo?]
  areas: [string, string, string, string][]; // [id, name, stateCode, type]
  districts: [string, string][]; // [stateCode, name]
}

export interface PersonHit {
  id: string;
  name: string;
  party: string;
  place: string;
  state: string;
  role: string;
  photo?: string;
}
export interface AreaHit {
  id: string;
  name: string;
  state: string;
  type: string; // PC | AC | RS | MLC
}
export interface DistrictHit {
  href: string;
  district: string;
  state: string;
}
export interface StateHit {
  stateCode: string;
  state: string;
}
export interface SearchHits {
  people: PersonHit[];
  areas: AreaHit[];
  districts: DistrictHit[];
  states: StateHit[];
  total: number;
}

interface PreparedEntry<T> {
  nameN: string;
  restN: string;
  item: T;
}

export interface PreparedIndex {
  builtAt: string;
  stateName: Map<string, string>;
  people: PreparedEntry<PersonHit>[];
  areas: PreparedEntry<AreaHit>[];
  districts: PreparedEntry<DistrictHit>[];
  states: PreparedEntry<StateHit>[];
}

/** Lowercase + strip Latin diacritics; Indic scripts pass through unchanged. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One-time preparation: expand state codes, precompute normalized haystacks. */
export function prepareIndex(raw: SearchIndexFile): PreparedIndex {
  const stateName = new Map(raw.states);
  const sn = (code: string | undefined) => (code && stateName.get(code)) || '';

  const people: PreparedEntry<PersonHit>[] = raw.people.map((r) => {
    const item: PersonHit = {
      id: r[0] || '',
      name: r[1] || '',
      party: r[2] || '',
      place: r[3] || '',
      state: sn(r[4]),
      role: r[5] || '',
      photo: r[7] || undefined,
    };
    return {
      nameN: norm(item.name) + (r[6] ? ' ' + norm(r[6]) : ''),
      restN: norm(`${item.party} ${item.place} ${item.state} ${item.role}`),
      item,
    };
  });

  const areas: PreparedEntry<AreaHit>[] = raw.areas.map((r) => {
    const item: AreaHit = { id: r[0], name: r[1], state: sn(r[2]), type: r[3] };
    return { nameN: norm(item.name), restN: norm(`${item.state} ${item.type}`), item };
  });

  const districts: PreparedEntry<DistrictHit>[] = raw.districts.map((r) => {
    const item: DistrictHit = {
      href: `/district/${r[0]}/${encodeURIComponent(r[1])}`,
      district: r[1],
      state: sn(r[0]),
    };
    return { nameN: norm(item.district), restN: norm(item.state), item };
  });

  const states: PreparedEntry<StateHit>[] = raw.states.map(([code, name]) => ({
    nameN: norm(name),
    restN: norm(code),
    item: { stateCode: code, state: name },
  }));

  return { builtAt: raw.builtAt, stateName, people, areas, districts, states };
}

/** Score one entry against the query tokens; 0 = no match. */
function scoreEntry(nameN: string, restN: string, tokens: string[]): number {
  let score = 0;
  for (const tok of tokens) {
    if (nameN.startsWith(tok)) score += 6;
    else if (nameN.includes(' ' + tok)) score += 4;
    else if (nameN.includes(tok)) score += 3;
    else if (restN.startsWith(tok) || restN.includes(' ' + tok)) score += 2;
    else if (restN.includes(tok)) score += 1;
    else return 0; // every token must match somewhere
  }
  return score;
}

function rank<T>(entries: PreparedEntry<T>[], tokens: string[], limit: number): T[] {
  const scored: { s: number; len: number; item: T }[] = [];
  for (const e of entries) {
    const s = scoreEntry(e.nameN, e.restN, tokens);
    if (s > 0) scored.push({ s, len: e.nameN.length, item: e.item });
  }
  scored.sort((a, b) => b.s - a.s || a.len - b.len);
  return scored.slice(0, limit).map((x) => x.item);
}

export function searchIndex(idx: PreparedIndex, query: string, limit = 8): SearchHits {
  const q = norm(query);
  if (!q) return { people: [], areas: [], districts: [], states: [], total: 0 };
  const tokens = q.split(' ').filter(Boolean);
  const people = rank(idx.people, tokens, limit);
  const areas = rank(idx.areas, tokens, limit);
  const districts = rank(idx.districts, tokens, limit);
  const states = rank(idx.states, tokens, Math.min(limit, 5));
  return {
    people,
    areas,
    districts,
    states,
    total: people.length + areas.length + districts.length + states.length,
  };
}
