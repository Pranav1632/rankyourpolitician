/**
 * Data-manager step: ingest the central-government sourcing-workflow output and
 * write data/seed/central_government.json. Applies verifier portfolio
 * corrections, and links a minister to an existing politician profile when we
 * already have one (by Wikidata QID or first+last name).
 *
 * Usage: npx tsx tools/data-manager/import-central-gov.ts <path-to-output.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function firstLast(name: string): string {
  const parts = name.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
  return parts.length ? parts[0] + (parts.length > 1 ? parts[parts.length - 1] : '') : '';
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npx tsx tools/data-manager/import-central-gov.ts <path-to-output.json>');
    process.exit(1);
  }
  const doc = JSON.parse(readFileSync(inputPath, 'utf8'));
  const r = doc.result ?? doc;
  const today: string = r.today || new Date().toISOString().slice(0, 10);
  const ministers: any[] = r.ministers || [];

  // Verifier corrections: name -> {verdict, correctedPortfolios}
  const checks = new Map<string, any>();
  for (const c of r.verify?.cabinetChecks || []) checks.set(firstLast(c.name), c);

  // Link to existing politician profiles.
  const politicians: any[] = JSON.parse(readFileSync(resolve(SEED_DIR, 'politicians.json'), 'utf8'));
  const byQid = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const p of politicians) {
    if (p.wikidata_qid) byQid.set(p.wikidata_qid, p.id);
    byName.set(firstLast(p.name), p.id);
  }

  const out = ministers.map((m) => {
    const chk = checks.get(firstLast(m.name));
    const portfolios =
      chk && chk.verdict === 'WRONG' && Array.isArray(chk.correctedPortfolios) && chk.correctedPortfolios.length
        ? chk.correctedPortfolios
        : m.portfolios || [];
    const politicianId = (m.wikidata_qid && byQid.get(m.wikidata_qid)) || byName.get(firstLast(m.name)) || undefined;
    return {
      id: slug(m.name),
      rank: m.rank,
      name: m.name,
      party: m.party,
      portfolios,
      house: m.house || undefined,
      constituency: m.constituency && m.constituency !== 'Rajya Sabha' ? m.constituency : undefined,
      state: m.state || undefined,
      wikidata_qid: m.wikidata_qid || undefined,
      politicianId,
      source_url: m.source_url || 'https://en.wikipedia.org/wiki/Third_Modi_ministry',
      source_name: m.source_name || 'Wikipedia - Third Modi ministry',
      retrieved_date: today,
    };
  });

  writeFileSync(resolve(SEED_DIR, 'central_government.json'), JSON.stringify(out, null, 2) + '\n');
  const ranks: Record<string, number> = {};
  out.forEach((m) => (ranks[m.rank] = (ranks[m.rank] || 0) + 1));
  const linked = out.filter((m) => m.politicianId).map((m) => `${m.name}→${m.politicianId}`);
  console.log(`Wrote ${out.length} ministers:`, ranks);
  console.log('Linked to profiles:', linked.length ? linked.join(', ') : 'none');
}

main();
