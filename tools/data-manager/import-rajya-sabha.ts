/**
 * Data-manager step: add the RAJYA SABHA (Parliament's upper house) - ~245
 * sitting members - from the canonical Wikipedia "List of current members of the
 * Rajya Sabha" (sourced to rajyasabha.nic.in). Members are state-elected (or
 * President-nominated), so they carry a state but NO territorial constituency.
 *
 * Identity-only here (name, party, state, term); bio/photo come from the shared
 * Wikidata enrichment (`enrich-mps`, which enriches any record carrying a
 * wikidata_qid). Rajya Sabha ministers already in central_government.json get
 * linked to their new profile.
 *
 * Usage:  npm run dm -- import-rajya-sabha
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician, Constituency, Minister } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');
const WP_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_TITLE = 'List_of_current_members_of_the_Rajya_Sabha';
const WIKI_URL = `https://en.wikipedia.org/wiki/${WIKI_TITLE}`;
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const TODAY = new Date().toISOString().slice(0, 10);

const STATE2CODE: Record<string, string> = {
  'Andhra Pradesh': 'AP', 'Arunachal Pradesh': 'AR', Assam: 'AS', Bihar: 'BR', Chhattisgarh: 'CG',
  Goa: 'GA', Gujarat: 'GJ', Haryana: 'HR', 'Himachal Pradesh': 'HP', Jharkhand: 'JH', Karnataka: 'KA',
  Kerala: 'KL', 'Madhya Pradesh': 'MP', Maharashtra: 'MH', Manipur: 'MN', Meghalaya: 'ML', Mizoram: 'MZ',
  Nagaland: 'NL', Odisha: 'OD', Punjab: 'PB', Rajasthan: 'RJ', Sikkim: 'SK', 'Tamil Nadu': 'TN',
  Telangana: 'TG', Tripura: 'TR', 'Uttar Pradesh': 'UP', Uttarakhand: 'UK', 'West Bengal': 'WB',
  Delhi: 'DL', 'National Capital Territory of Delhi': 'DL', Puducherry: 'PY',
  'Jammu and Kashmir': 'JK', 'Jammu and Kashmir (union territory)': 'JK',
  Nominated: 'NOM',
};
const CODE2STATE: Record<string, string> = {
  AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CG: 'Chhattisgarh', GA: 'Goa',
  GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala',
  MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland',
  OD: 'Odisha', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana', TR: 'Tripura',
  UP: 'Uttar Pradesh', UK: 'Uttarakhand', WB: 'West Bengal', DL: 'Delhi', PY: 'Puducherry', JK: 'Jammu & Kashmir',
  NOM: "Nominated (President's nominee)",
};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const clean = (s: string) => s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '')
  .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/'''?/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function api(base: string, params: Record<string, string>): Promise<any> {
  const u = base + '?format=json&formatversion=2&origin=*&' + new URLSearchParams(params);
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 700 * (a + 1)));
  }
  throw new Error('API failed: ' + u);
}

interface Member { code: string; name: string; title: string | null; party: string; termStart?: string; termEnd?: string; }

function parseMembers(wt: string): Member[] {
  const parts = wt.split(/^==\s*(.+?)\s*==\s*$/m);
  const out: Member[] = [];
  for (let s = 1; s < parts.length; s += 2) {
    const heading = clean(parts[s]);
    const code = STATE2CODE[heading];
    if (!code) continue;
    const body = parts[s + 1] || '';
    // Only the wikitable block(s).
    const rows = body.split(/\n\|-/);
    let curParty = '';
    for (const row of rows) {
      // A data row has a member: a [[wikilink]] name or a plain name after the number.
      const pm = row.match(/party name with colou?r\s*\|\s*([^|}\n]+)/i);
      if (pm) curParty = clean(pm[1]);
      // name: first wikilink that isn't a party/ref/file, else the 2nd cell text.
      const cells = row.split(/\n\s*\|/).map((c) => c.trim()).filter(Boolean);
      // find the name cell: the one with [[...]] not containing "party"/"File:"
      let title: string | null = null;
      let name: string | null = null;
      for (const c of cells) {
        const lm = c.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
        if (lm && !/File:|party|\.svg|\.png/i.test(lm[1])) { title = lm[1].trim().replace(/_/g, ' '); name = clean(lm[2] || lm[1]); break; }
      }
      if (!name) {
        // plain-text name row: cell after the number that is not a date/party/number
        const cand = cells.find((c) => /^[A-Za-z]/.test(c) && !/party name with colou?r/i.test(c) && !/^\d/.test(c) && !/^\d{2}-\w{3}-\d{4}/.test(clean(c)));
        if (cand) name = clean(cand);
      }
      // Reject leaked table markup / vacant / header rows - keep only real names.
      if (!name || name.length < 2 || name.length > 50) continue;
      if (/[=|!{}#]|bgcolor|colspan|rowspan|style|wikitable|vacant|nominated by|^keys$/i.test(name)) continue;
      if (/\d/.test(name) || !/^[A-Za-z]/.test(name)) continue;
      const dates = [...row.matchAll(/(\d{2}-[A-Za-z]{3}-\d{4})/g)].map((m) => m[1]);
      out.push({ code, name, title, party: curParty || 'Independent', termStart: dates[0], termEnd: dates[1] });
    }
  }
  return out;
}

async function titlesToQids(titles: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const jr = await api(WP_API, { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', titles: batch.join('|'), redirects: '1' });
    const norm = new Map<string, string>((jr.query.normalized || []).map((n: any) => [n.from, n.to]));
    const redir = new Map<string, string>((jr.query.redirects || []).map((r: any) => [r.from, r.to]));
    const byT = new Map<string, string>((jr.query.pages || []).map((p: any) => [p.title, p.pageprops?.wikibase_item]));
    for (const t of batch) { let k = norm.get(t) || t; k = redir.get(k) || k; const q = byT.get(k); if (q) map.set(t, q); }
  }
  return map;
}

const HONORIFICS = /\b(dr|shri|smt|prof|adv|capt|captain|kumari|km|md|mr|mrs|ms|sardar|maulana|thiru)\.?\b/gi;
const normName = (n: string) => clean(n).toLowerCase().replace(HONORIFICS, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  console.log('Fetching the Rajya Sabha members list…');
  const wt = (await api(WP_API, { action: 'parse', page: WIKI_TITLE, prop: 'wikitext' })).parse.wikitext as string;
  const members = parseMembers(wt);
  console.log(`Parsed ${members.length} Rajya Sabha members. Resolving Wikidata QIDs…`);
  const t2q = await titlesToQids([...new Set(members.filter((m) => m.title).map((m) => m.title!))]);

  const pols: Politician[] = existsSync(resolve(SEED_DIR, 'politicians.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8')) : [];
  const cons: Constituency[] = existsSync(resolve(SEED_DIR, 'constituencies.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'constituencies.json'), 'utf8')) : [];
  const central: Minister[] = existsSync(resolve(SEED_DIR, 'central_government.json'))
    ? JSON.parse(readFileSync(resolve(SEED_DIR, 'central_government.json'), 'utf8')) : [];

  // Drop any previously-generated RS records so a re-run is clean (keep LS + curated).
  const kept = pols.filter((p) => !(p.house === 'Rajya Sabha' && p.generated));
  const existingById = new Map(kept.map((p) => [p.id, p]));

  let added = 0;
  for (const m of members) {
    const state = CODE2STATE[m.code] || m.code;
    const id = slug(`${m.name}-rs-${m.code}`);
    if (existingById.has(id)) continue;
    const qid = m.title ? t2q.get(m.title) : undefined;
    const termClause = m.termStart && m.termEnd ? ` Current term: ${m.termStart} to ${m.termEnd}.` : '';
    const repClause = m.code === 'NOM' ? 'as a President-nominated member' : `representing ${state}`;
    kept.push({
      id,
      name: m.name,
      party: m.party,
      house: 'Rajya Sabha',
      state,
      stateCode: m.code,
      constituencyId: '',
      constituencyName: 'Rajya Sabha',
      constituencyType: 'RS',
      districts: [],
      current_position: 'Member of Parliament, Rajya Sabha',
      is_minister: false,
      neutral_summary: `${m.name} is a Member of Parliament in the Rajya Sabha (the upper house of India's Parliament), ${repClause}. Current party affiliation: ${m.party}.${termClause}`,
      metrics: {},
      facts: [],
      active: true,
      generated: true,
      identity_source: { url: WIKI_URL, name: 'Rajya Sabha Secretariat (rajyasabha.nic.in) - current members list', retrieved_date: TODAY },
      ...(qid ? { wikidata_qid: qid } : {}),
    });
    existingById.set(id, kept[kept.length - 1]);
    added++;
  }

  // Link Rajya Sabha ministers (in central_government) to their profile, by id or
  // name. Runs even if already linked, so is_minister survives a re-import.
  const rsByName = new Map<string, Politician>();
  const rsById = new Map<string, Politician>();
  for (const p of kept) if (p.house === 'Rajya Sabha') { rsByName.set(normName(p.name), p); rsById.set(p.id, p); }
  let linked = 0;
  for (const mn of central) {
    if (mn.house && mn.house !== 'Rajya Sabha') continue;
    const p = (mn.politicianId && rsById.get(mn.politicianId)) || rsByName.get(normName(mn.name));
    if (p) {
      mn.politicianId = p.id;
      p.is_minister = true;
      p.current_position = mn.rank === 'Cabinet' ? 'Union Cabinet Minister' : mn.rank === 'MoS-IC' ? 'Union Minister of State (Independent Charge)' : 'Union Minister of State';
      linked++;
    }
  }

  kept.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  writeFileSync(resolve(SEED_DIR, 'politicians.json'), JSON.stringify(kept, null, 2) + '\n');
  writeFileSync(resolve(SEED_DIR, 'central_government.json'), JSON.stringify(central, null, 2) + '\n');
  console.log(`\n✓ Added ${added} Rajya Sabha members (${t2q.size} with a Wikidata QID).`);
  console.log(`✓ Linked ${linked} Rajya Sabha ministers to their new profile.`);
  console.log('\nNext: npm run dm -- enrich-mps   (fills bio/photo for the new members)   then   validate   then   publish');
}

main().catch((e) => { console.error(e); process.exit(1); });
