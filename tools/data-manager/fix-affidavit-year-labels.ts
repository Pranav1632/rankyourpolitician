/**
 * One-off data repair: make every MyNeta-sourced fact's stated election year
 * agree with the election page it cites.
 *
 * enrich-affidavits-states.ts used to take the year from a hardcoded config
 * field while trying several candidate slugs in order, so when the first slug
 * resolved to a DIFFERENT election than the config described, the fact was
 * written with the wrong year. Bihar hit exactly that: 549 facts across 183
 * sitting MLAs were read from bihar2025 pages (the Nov-2025 assembly, which is
 * the correct source for the sitting house) but labelled "2020 assembly
 * election affidavit" - a five-year error on the as_of the profile displays.
 *
 * This rewrites `as_of`/`source_name` to the year in the cited source_url. It
 * touches ONLY the label, never a value: the figures were always read from the
 * page named in source_url, so relabelling makes the citation honest rather
 * than changing what we claim.
 *
 * The root cause is fixed in enrich-affidavits-states.ts (the year is now
 * derived from the slug that resolved), so this is not expected to find
 * anything on a healthy dataset - it is safe and idempotent to re-run.
 *
 * Usage:  npx tsx tools/data-manager/fix-affidavit-year-labels.ts [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const APPLY = process.argv.includes('--apply');

function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  const changes = new Map<string, number>();
  let fixed = 0;

  for (const p of pols) {
    for (const f of p.facts) {
      const slug = (f.source_url?.match(/myneta\.info\/([A-Za-z0-9_]+)\//) || [])[1];
      if (!slug) continue;
      const srcYear = (slug.match(/(\d{4})/) || [])[1];
      if (!srcYear) continue; // e.g. the undated MLC archives - nothing to check

      const stated = `${f.as_of || ''} ${f.source_name || ''}`;
      const statedYear = (stated.match(/(\d{4})/) || [])[1];
      if (!statedYear || statedYear === srcYear) continue;

      const before = `${slug}: "${f.as_of}"`;
      f.as_of = (f.as_of || '').replace(statedYear, srcYear);
      f.source_name = (f.source_name || '').replace(statedYear, srcYear);
      changes.set(`${before}  ->  "${f.as_of}"`, (changes.get(`${before}  ->  "${f.as_of}"`) || 0) + 1);
      fixed++;
    }
  }

  if (!fixed) { console.log('✓ Every MyNeta fact already states the year of the page it cites.'); return; }
  for (const [k, v] of [...changes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)} facts | ${k}`);
  if (APPLY) {
    writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');
    console.log(`\n✓ Relabelled ${fixed} facts to match their cited source.`);
  } else {
    console.log(`\n${fixed} facts would be relabelled. Re-run with --apply to write.`);
  }
}

main();
