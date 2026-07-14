/**
 * Data-manager step: raise PHOTO coverage. enrich-wikidata already took the
 * Wikidata image (P18) and the English-Wikipedia lead image; but most Indian
 * MLAs have no enwiki article, yet DO have a portrait on their Hindi or
 * regional-language Wikipedia. This pass, for every photoless record with a
 * Wikidata QID, checks each language edition it is linked to and takes the
 * page's lead image — but ONLY when that file lives on Wikimedia Commons (i.e.
 * is freely licensed). Local fair-use uploads return "missing" on Commons and
 * are dropped, so we never attach an unlicensed image. Fill-only.
 *
 * Usage:  npm run dm -- enrich-photos
 *         PHOTO_LIMIT=200 npm run dm -- enrich-photos   (first 200 — testing)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const WD_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'RankYourPolitician-DataManager/1.0 (civic info; vikas070696@gmail.com)';
const LIMIT = process.env.PHOTO_LIMIT ? parseInt(process.env.PHOTO_LIMIT, 10) : Infinity;

// Language editions to consult, in preference order (portrait quality / recency).
const WIKIS = ['en', 'hi', 'bn', 'mr', 'ta', 'te', 'kn', 'ml', 'gu', 'pa', 'or', 'as', 'ur', 'ne', 'sa', 'mai'];
const WIKI_RANK = new Map(WIKIS.map((w, i) => [`${w}wiki`, i]));

async function api(base: string, params: Record<string, string>): Promise<any> {
  const u = base + '?format=json&formatversion=2&origin=*&' + new URLSearchParams(params);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
    } catch (e) { if (attempt === 4) throw e; }
    await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
  }
}

async function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  let targets = pols.filter((p) => !p.photo_url && p.wikidata_qid);
  if (LIMIT !== Infinity) targets = targets.slice(0, LIMIT);
  console.log(`Photoless records with a QID: ${targets.length}. Fetching sitelinks…`);

  // 1. sitelinks for each target QID
  const qidByPol = new Map(targets.map((p) => [p.id, p.wikidata_qid!]));
  const qids = [...new Set(qidByPol.values())];
  const sitelinks = new Map<string, Record<string, string>>(); // qid -> { dbname: title }
  for (let i = 0; i < qids.length; i += 50) {
    const jr = await api(WD_API, { action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'sitelinks' });
    for (const [id, ent] of Object.entries<any>(jr.entities || {})) {
      const links: Record<string, string> = {};
      for (const [db, sl] of Object.entries<any>(ent.sitelinks || {})) if (WIKI_RANK.has(db)) links[db] = sl.title;
      if (Object.keys(links).length) sitelinks.set(id, links);
    }
    if (i % 500 === 0) process.stdout.write(`  sitelinks ${i}/${qids.length}\r`);
  }

  // 2. For each wiki, batch pageimages for the titles present there.
  //    fileByQid keeps the best (highest-ranked wiki) candidate per QID.
  const fileByQid = new Map<string, { file: string; rank: number }>();
  for (const wiki of WIKIS) {
    const db = `${wiki}wiki`;
    const entries: { qid: string; title: string }[] = [];
    for (const [qid, links] of sitelinks) if (links[db]) entries.push({ qid, title: links[db] });
    if (!entries.length) continue;
    const rank = WIKI_RANK.get(db)!;
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50);
      try {
        const jr = await api(`https://${wiki}.wikipedia.org/w/api.php`, {
          action: 'query', prop: 'pageimages', piprop: 'name', titles: batch.map((e) => e.title).join('|'), redirects: '1',
        });
        const back = new Map<string, string>();
        for (const n of jr.query?.normalized || []) back.set(n.to, n.from);
        for (const r of jr.query?.redirects || []) back.set(r.to, r.from);
        const titleToQid = new Map(batch.map((e) => [e.title, e.qid]));
        for (const pg of jr.query?.pages || []) {
          if (!pg.pageimage) continue;
          let key = pg.title; key = back.get(key) || key; key = back.get(key) || key;
          const qid = titleToQid.get(key);
          if (!qid) continue;
          const cur = fileByQid.get(qid);
          if (!cur || rank < cur.rank) fileByQid.set(qid, { file: pg.pageimage, rank });
        }
      } catch { /* skip batch */ }
    }
    process.stdout.write(`  ${db}: scanned ${entries.length}\n`);
  }

  // 3. Commons license gate — keep only files that live on Commons (free).
  const files = [...new Set([...fileByQid.values()].map((v) => v.file))].map((f) => `File:${f}`);
  console.log(`Verifying ${files.length} candidate images on Commons…`);
  const license = new Map<string, string>();
  const onCommons = new Set<string>();
  for (let i = 0; i < files.length; i += 50) {
    try {
      const jr = await api(COMMONS_API, { action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', titles: files.slice(i, i + 50).join('|') });
      for (const pg of jr.query?.pages || []) {
        if (pg.missing) continue;
        const name = pg.title.replace(/^File:/, '');
        onCommons.add(name);
        const lic = pg.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value;
        if (lic) license.set(name, lic);
      }
    } catch { /* skip */ }
  }

  // 4. Merge (fill-only).
  const byId = new Map(pols.map((p) => [p.id, p]));
  let added = 0;
  const byWiki: Record<string, number> = {};
  for (const [polId, qid] of qidByPol) {
    const cand = fileByQid.get(qid);
    if (!cand || !onCommons.has(cand.file)) continue;
    const p = byId.get(polId);
    if (!p || p.photo_url) continue;
    p.photo_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(cand.file)}?width=400`;
    p.photo_license = `${license.get(cand.file) || 'See Wikimedia Commons'} · Wikimedia Commons`;
    added++;
    const w = WIKIS[cand.rank]; byWiki[w] = (byWiki[w] || 0) + 1;
  }

  writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');
  console.log(`\n✓ enrich-photos: added ${added} photos.`);
  console.log('  by source wiki:', Object.entries(byWiki).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}:${n}`).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
