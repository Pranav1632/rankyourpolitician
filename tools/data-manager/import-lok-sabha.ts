/**
 * Data-manager step: rebuild the national Lok Sabha roster from the canonical,
 * ECI-sourced "List of members of the 18th Lok Sabha" (Wikipedia), which is kept
 * current for by-elections, defections and mergers. This gives every one of the
 * 543 seats — name, party, constituency, state — CITED to that list.
 *
 * It is deliberately identity-only: NO financial/criminal/performance numbers are
 * invented here. Those are added per-member through the guided data-manager flow,
 * each with its own source. Records that already carry such facts (`facts.length`)
 * are treated as CURATED and are never overwritten by a refresh.
 *
 * Ministers are linked to their MP profile (so a profile shows all portfolios).
 * Genuinely vacant seats (incumbent died/resigned, by-election pending) are kept
 * as constituencies with no sitting member — shown honestly, never back-filled.
 *
 * Usage:  npm run dm -- refresh-mps        (fetches live)
 *         npx tsx tools/data-manager/import-lok-sabha.ts [cached.wikitext]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Constituency, Minister } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const WIKI_TITLE = 'List_of_members_of_the_18th_Lok_Sabha';
const WIKI_URL = `https://en.wikipedia.org/wiki/${WIKI_TITLE}`;
const API = `https://en.wikipedia.org/w/api.php?action=parse&page=${WIKI_TITLE}&prop=wikitext&format=json&formatversion=2`;

const SEC2CODE: Record<string, string> = {
  'Andaman and Nicobar Islands': 'AN', 'Andhra Pradesh': 'AP', 'Arunachal Pradesh': 'AR', Assam: 'AS', Bihar: 'BR',
  Chandigarh: 'CH', Chhattisgarh: 'CG', 'Dadra and Nagar Haveli and Daman and Diu': 'DN', Delhi: 'DL', Goa: 'GA',
  Gujarat: 'GJ', Haryana: 'HR', 'Himachal Pradesh': 'HP', 'Jammu and Kashmir': 'JK', Jharkhand: 'JH', Karnataka: 'KA',
  Kerala: 'KL', Ladakh: 'LA', Lakshadweep: 'LD', 'Madhya Pradesh': 'MP', Maharashtra: 'MH', Manipur: 'MN',
  Meghalaya: 'ML', Mizoram: 'MZ', Nagaland: 'NL', Odisha: 'OD', Puducherry: 'PY', Punjab: 'PB', Rajasthan: 'RJ',
  Sikkim: 'SK', 'Tamil Nadu': 'TN', Telangana: 'TG', Tripura: 'TR', 'Uttar Pradesh': 'UP', Uttarakhand: 'UK', 'West Bengal': 'WB',
};
// Display state names (match lib/geo.ts codes; readable in the UI).
const CODE2STATE: Record<string, string> = {
  AN: 'Andaman & Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
  CH: 'Chandigarh', CG: 'Chhattisgarh', DN: 'Dadra & Nagar Haveli and Daman & Diu', DL: 'Delhi', GA: 'Goa',
  GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JK: 'Jammu & Kashmir', JH: 'Jharkhand', KA: 'Karnataka',
  KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur',
  ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', PY: 'Puducherry', PB: 'Punjab', RJ: 'Rajasthan',
  SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand', WB: 'West Bengal',
};
// Expected 2024 seat counts — a hard structural check against silent parse drift.
const EXPECTED: Record<string, number> = {
  AN: 1, AP: 25, AR: 2, AS: 14, BR: 40, CH: 1, CG: 11, DN: 2, DL: 7, GA: 2, GJ: 26, HR: 10, HP: 4, JK: 5, JH: 14,
  KA: 28, KL: 20, LA: 1, LD: 1, MP: 29, MH: 48, MN: 2, ML: 2, MZ: 1, NL: 1, OD: 21, PY: 1, PB: 13, RJ: 25, SK: 1,
  TN: 39, TG: 17, TR: 2, UP: 80, UK: 5, WB: 42,
};
const ALLIANCE = new Set(['National Democratic Alliance', 'Indian National Developmental Inclusive Alliance', 'INDIA', 'NDA', 'Others', 'Other', 'None', '']);

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const stripTags = (s: string) => s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '').replace(/\{\{efn[^}]*\}\}/gi, '');
const clean = (s: string) => stripTags(s)
  .replace(/\{\{sortname\|([^|}]+)\|([^|}]+)(\|[^}]*)?\}\}/gi, '$1 $2')
  .replace(/\{\{nowrap\|([^}]*)\}\}/gi, '$1')
  .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ').trim();
const normParty = (p: string | null) => p ? clean(p).replace(/\s*\((?:19|20)\d\d[–-](?:present|\d\d\d\d)\)\s*$/i, '').trim() : p;
const cellsOf = (row: string) => ('\n' + row).split(/\n\s*[|!]\s?/).map((c) => c.trim()).filter((c) => c.length);

function nameFrom(cell: string | undefined): string | null {
  if (!cell) return null;
  if (/colspan/i.test(cell) && /vacant/i.test(cell)) return '(vacant)';
  const l = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  return l ? clean(l[2] || l[1]) : clean(cell) || null;
}
// Party abbreviations used in the source's switch notes -> canonical full names.
const PARTY_ABBR: Record<string, string> = {
  AITC: 'All India Trinamool Congress', TMC: 'All India Trinamool Congress',
  NCPI: 'Nationalist Citizens Party of India', BJP: 'Bharatiya Janata Party',
  INC: 'Indian National Congress', NCP: 'Nationalist Congress Party',
  'NCP(SP)': 'Nationalist Congress Party (Sharadchandra Pawar)',
  'SS(UBT)': 'Shiv Sena (UBT)', SS: 'Shiv Sena',
};
const expandParty = (s: string) => { const k = clean(s).replace(/\.\s*$/, '').trim(); return PARTY_ABBR[k] || PARTY_ABBR[k.toUpperCase()] || k; };

interface Switch { from: string; to: string; date: string; }
function switchesFrom(cell: string | undefined): Switch[] {
  if (!cell) return [];
  const out: Switch[] = [];
  for (const m of cell.matchAll(/Switched from (.+?) to (.+?) on ([^.|}]+)/gi)) {
    out.push({ from: expandParty(m[1]), to: expandParty(m[2]), date: clean(m[3]) });
  }
  return out;
}
// A non-switch by-election/status note (switches are captured structurally above).
// Handles both {{efn|...}} footnotes and {{small|''(...)''}} inline annotations.
function noteFrom(cell: string | undefined): string | null {
  if (!cell) return null;
  const m = cell.match(/\{\{(?:efn|small)\|([^}]+)\}\}/i);
  if (!m) return null;
  const t = m[1].split('|')[0].replace(/''/g, '').replace(/^\s*\(|\)\s*$/g, '').trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  if (/switched from/i.test(t)) return null;
  return /(elected on|by-election|byelection|resign|died|passed away|expel|left )/i.test(t) ? t : null;
}
function partyFrom(row: string): string | null {
  const full = row.match(/Full party name with colou?r\s*\|\s*([^|}\n]+)/i);
  if (full) return normParty(full[1]);
  for (const m of row.matchAll(/\{\{\s*Party name with colou?r\s*\|\s*([^|}\n]+)/gi)) {
    const v = normParty(m[1]);
    if (v && !ALLIANCE.has(v)) return v;
  }
  const arr = cellsOf(row);
  const ci = arr.findIndex((c) => / Lok Sabha constituency/.test(c));
  for (let k = ci + 2; k < arr.length; k++) {
    const lk = arr[k].match(/\[\[([^\]|]+)\]\]/);
    if (lk) { const v = normParty(lk[1]); if (v && !ALLIANCE.has(v) && !/Alliance$/.test(v)) return v; }
  }
  return null;
}

interface Seat { code: string; cons: string; name?: string; party?: string; vacant?: boolean; note?: string; switches?: Switch[]; }

function parseRoster(wt: string): Seat[] {
  const parts = wt.split(/^==\s*(.+?)\s*==\s*$/m);
  const seats: Seat[] = [];
  for (let s = 1; s < parts.length; s += 2) {
    const code = SEC2CODE[clean(parts[s])];
    if (!code) continue;
    const rows = (parts[s + 1] || '').split(/\n\|-/);
    let curParty: string | null = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cm = row.match(/(?:rowspan\s*=\s*"?(\d+)"?\s*\|\s*)?\[\[([^\]|]*) Lok Sabha constituency(?:\|([^\]]+))?\]\]/);
      if (!cm) continue;
      const arr = cellsOf(row);
      const ci = arr.findIndex((c) => / Lok Sabha constituency/.test(c));
      if (ci < 0) continue;
      const cons = clean(cm[3] || cm[2]).replace(/\s*\((SC|ST)\)\s*$/i, '').trim();
      const span = cm[1] ? parseInt(cm[1], 10) : 1;
      let name: string | null = nameFrom(arr[ci + 1]);
      let party: string | null = partyFrom(row) || curParty;
      if (party) curParty = party;
      let note: string | undefined = noteFrom(arr[ci + 1]) || undefined;
      let switches: Switch[] = switchesFrom(arr[ci + 1]);
      let vacant = false;
      for (let k = 1; k < span; k++) {
        const cont = rows[i + k] || '';
        const cp = partyFrom(cont);
        if (cp) curParty = cp;
        const cn = nameFrom(cellsOf(cont)[0]);
        if (cn === '(vacant)') { vacant = true; name = null; }
        else if (cn) {
          name = cn; party = cp || curParty; vacant = false;
          note = noteFrom(cellsOf(cont)[0]) || note;
          switches = switches.concat(switchesFrom(cellsOf(cont)[0]));
        }
      }
      i += span - 1;
      if (vacant || !name || name === '(vacant)') seats.push({ code, cons, vacant: true });
      else seats.push({ code, cons, name, party: party || undefined, note, switches: switches.length ? switches : undefined });
    }
  }
  return seats;
}

function validateCounts(seats: Seat[]) {
  const by: Record<string, number> = {};
  for (const s of seats) by[s.code] = (by[s.code] || 0) + 1;
  const bad: string[] = [];
  for (const c of Object.keys(EXPECTED)) if ((by[c] || 0) !== EXPECTED[c]) bad.push(`${c}:${by[c] || 0}/${EXPECTED[c]}`);
  return { ok: bad.length === 0 && seats.length === 543, bad };
}

async function fetchWikitext(): Promise<string> {
  const arg = process.argv[2];
  if (arg && existsSync(arg)) return readFileSync(arg, 'utf8');
  const r = await fetch(API, { headers: { 'User-Agent': 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)' } });
  if (!r.ok) throw new Error(`Wikipedia API HTTP ${r.status}`);
  const j = (await r.json()) as any;
  const wt = j?.parse?.wikitext;
  if (!wt) throw new Error('No wikitext in API response');
  return wt as string;
}

// Normalise a person's name for minister<->MP matching (drop honorifics/punctuation).
const HONORIFICS = /\b(dr|shri|smt|prof|adv|capt|captain|kumari|km|md|mr|mrs|ms|sardar|maulana|thiru)\.?\b/gi;
const normName = (n: string) => clean(n).toLowerCase().replace(HONORIFICS, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const wt = await fetchWikitext();
  const seats = parseRoster(wt);
  const { ok, bad } = validateCounts(seats);
  if (!ok) {
    console.error(`✗ Seat-count validation FAILED (${seats.length}/543). Mismatched: ${bad.join(', ')}`);
    console.error('  Aborting — the source layout may have changed. Not overwriting the seed.');
    process.exit(1);
  }
  const mps = seats.filter((s) => !s.vacant);
  const vacant = seats.filter((s) => s.vacant);
  console.log(`✓ Parsed & validated: 543 seats (36/36 state counts match) — ${mps.length} sitting MPs, ${vacant.length} vacant.`);

  // Load existing seed. Preserve CURATED records (any with facts) and their constituencies.
  const existingPols: Politician[] = existsSync(resolve(SEED_DIR, 'politicians.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8')) : [];
  const existingCons: Constituency[] = existsSync(resolve(SEED_DIR, 'constituencies.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'constituencies.json'), 'utf8')) : [];
  const central: Minister[] = existsSync(resolve(SEED_DIR, 'central_government.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'central_government.json'), 'utf8')) : [];

  const curated = existingPols.filter((p) => (p.facts?.length ?? 0) > 0 && !p.generated);
  const curatedByCons = new Map(curated.map((p) => [p.constituencyId, p]));
  const consById = new Map<string, Constituency>();
  for (const c of existingCons) consById.set(c.id, c); // keep existing districts etc.

  const politicians: Politician[] = [...curated];
  for (const seat of seats) {
    const code = seat.code;
    const state = CODE2STATE[code];
    const constituencyId = `pc-${code.toLowerCase()}-${slug(seat.cons)}`;
    // Constituency (always recorded, incl. vacant seats).
    if (!consById.has(constituencyId)) {
      consById.set(constituencyId, { id: constituencyId, type: 'PC', name: seat.cons, state, stateCode: code, districts: [] });
    }
    if (seat.vacant) continue;
    if (curatedByCons.has(constituencyId)) continue; // keep the detailed record

    const districts = consById.get(constituencyId)?.districts ?? [];
    const party = seat.party || 'Independent';
    // Build the party-affiliation timeline for the current term (only when switched).
    let party_history: Politician['party_history'];
    if (seat.switches && seat.switches.length) {
      const sw = seat.switches;
      party_history = [{ party: sw[0].from, from: 'Elected 2024', until: sw[0].date }];
      sw.forEach((s, i) => party_history!.push({ party: s.to, from: s.date, until: sw[i + 1]?.date, current: i === sw.length - 1 }));
    }
    const byDate = seat.note && /elected on/i.test(seat.note) ? seat.note.replace(/.*elected on/i, '').trim() : null;
    const electedClause = byDate ? `won the by-election on ${byDate}` : 'elected in the 2024 Indian general election';
    const partyClause = party_history ? ` Elected in 2024 as ${party_history[0].party}; current party: ${party}.` : ` Current party affiliation: ${party}.`;
    const summary = `${seat.name} is the Member of Parliament for the ${seat.cons} constituency in ${state}, in the 18th Lok Sabha (${electedClause}).${partyClause}`;
    politicians.push({
      id: slug(`${seat.cons}-${seat.name}`),
      name: seat.name!,
      party,
      house: 'Lok Sabha',
      state,
      stateCode: code,
      constituencyId,
      constituencyName: seat.cons,
      constituencyType: 'PC',
      districts,
      current_position: 'Member of Parliament, Lok Sabha',
      is_minister: false,
      neutral_summary: summary,
      metrics: {},
      facts: [],
      active: true,
      generated: true,
      identity_source: { url: WIKI_URL, name: 'Election Commission of India — 2024 general election results (18th Lok Sabha members list)', retrieved_date: today },
      ...(seat.note && !byDate ? { party_note: seat.note } : {}),
      ...(party_history ? { party_history } : {}),
    });
  }

  // Link ministers -> their MP profile so a single profile shows every portfolio.
  const byNorm = new Map<string, Politician>();
  const byConsKey = new Map<string, Politician>();
  for (const p of politicians) {
    byNorm.set(normName(p.name), p);
    byConsKey.set(`${p.stateCode}|${normName(p.constituencyName)}`, p);
  }
  let linked = 0; const unmatched: string[] = [];
  for (const m of central) {
    let pol: Politician | undefined;
    if (m.politicianId) pol = politicians.find((p) => p.id === m.politicianId);
    if (!pol && m.constituency && m.state) {
      const code = Object.entries(CODE2STATE).find(([, n]) => normName(n) === normName(m.state!))?.[0];
      if (code) pol = byConsKey.get(`${code}|${normName(m.constituency)}`);
    }
    if (!pol) pol = byNorm.get(normName(m.name));
    if (pol) {
      m.politicianId = pol.id;
      if (!pol.is_minister) {
        pol.is_minister = true;
        // Only relabel generated roster records; never touch curated current_position.
        if (pol.generated) {
          pol.current_position = m.rank === 'PM' ? 'Prime Minister of India'
            : m.rank === 'Cabinet' ? 'Union Cabinet Minister'
            : m.rank === 'MoS-IC' ? 'Union Minister of State (Independent Charge)'
            : 'Union Minister of State';
        }
      }
      linked++;
    } else if (m.rank !== 'PM' && (m.house === 'Lok Sabha')) {
      unmatched.push(`${m.name} (${m.constituency || '?'})`);
    }
  }

  const constituencies = [...consById.values()].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  politicians.sort((a, b) => a.state.localeCompare(b.state) || a.constituencyName.localeCompare(b.constituencyName));

  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(politicians, null, 2) + '\n');
  writeFileSync(resolve(SEED_DIR, 'constituencies.json'), JSON.stringify(constituencies, null, 2) + '\n');
  writeFileSync(resolve(SEED_DIR, 'central_government.json'), JSON.stringify(central, null, 2) + '\n');

  const withHistory = politicians.filter((p) => p.party_history?.length).length;
  const withNote = politicians.filter((p) => p.party_note).length;
  console.log(`\n✓ Wrote ${politicians.length} politicians (${curated.length} curated preserved), ${constituencies.length} constituencies.`);
  console.log(`✓ Ministers linked to an MP profile: ${linked}/${central.length}.`);
  console.log(`✓ Party-switch timelines captured: ${withHistory}. By-election/status notes: ${withNote}.`);
  console.log(`ℹ Vacant seats (no sitting member): ${vacant.map((v) => `${v.cons} (${v.code})`).join(', ')}`);
  if (unmatched.length) console.log(`⚠ Lok Sabha ministers not auto-linked (review): ${unmatched.join('; ')}`);
  console.log('\nNext: npm run dm -- validate   then   npm run dm -- publish');
}

main().catch((e) => { console.error(e); process.exit(1); });
