/**
 * Data-manager step: re-derive machine-sourced affidavit VALUES from the pages
 * they cite, correcting any that drifted.
 *
 * The enrich-affidavits* steps are deliberately fill-only, so they can never
 * repair a value they wrote earlier - if the parser improves, the old figure
 * stays. This step closes that loop: it re-fetches each cited MyNeta page,
 * re-parses it, and rewrites the stored value when it disagrees.
 *
 * It only ever touches facts whose source_name marks them as MyNeta/ADR-sourced,
 * so hand-curated facts are never overwritten. The citation itself is untouched -
 * only the value, and only to match the page already named in source_url.
 *
 * Usage:  npx tsx tools/data-manager/refresh-affidavit-values.ts [--apply]
 *         AFF_SINCE=2026-07-15 npx tsx ... --apply     (only facts from this run)
 *         AFF_SLUGS=TamilNadu2026,bihar2025 npx tsx ... --apply   (batch by election)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician } from '../../lib/types';
import { getHtml, parseCandidatePage, pool, type Affidavit } from './myneta';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');
const APPLY = process.argv.includes('--apply');
const TODAY = new Date().toISOString().slice(0, 10);
const SINCE = process.env.AFF_SINCE;
// Re-reading every election in one process (~4,500 pages) does not survive to
// print its summary, so allow completable batches.
const SLUGS = process.env.AFF_SLUGS ? new Set(process.env.AFF_SLUGS.split(',').map((x) => x.trim())) : null;
const slugOf = (url: string) => (url.match(/myneta\.info\/([A-Za-z0-9_]+)\//) || [])[1] || '';
const FIELDS = ['assets_total', 'liabilities_total', 'criminal_cases_declared'] as const;

async function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));

  // Group by cited page: one fetch can refresh several fields of one member.
  const targets = pols
    .map((p) => ({
      p,
      url: p.facts.find(
        (f) => (FIELDS as readonly string[]).includes(f.field_type) &&
          /^MyNeta \/ ADR/.test(f.source_name || '') &&
          (!SINCE || f.retrieved_date >= SINCE),
      )?.source_url,
    }))
    .filter((x): x is { p: Politician; url: string } => !!x.url)
    .filter((x) => !SLUGS || SLUGS.has(slugOf(x.url)));

  console.log(`Re-reading ${targets.length} cited affidavit pages…`);
  const pages = await pool(targets, 6, async ({ url }) => getHtml(url));

  let changed = 0, membersChanged = 0, unreachable = 0;
  const log: string[] = [];

  targets.forEach(({ p, url }, i) => {
    const html = pages[i];
    if (!html) { unreachable++; return; }
    const now: Affidavit = parseCandidatePage(html);
    let touched = false;
    for (const field of FIELDS) {
      const fact = p.facts.find((f) => f.field_type === field && f.source_url === url && /^MyNeta \/ ADR/.test(f.source_name || ''));
      const value = now[field];
      if (!fact || !value || fact.value === value) continue;
      log.push(`${p.name} (${p.state} ${p.constituencyName}) ${field}: ${fact.value} -> ${value}`);
      fact.value = value;
      // The value we now publish was read from the source TODAY, so the citation
      // must say so - leaving the old date would claim we saw this figure on a
      // day we did not.
      fact.retrieved_date = TODAY;
      changed++; touched = true;
    }
    if (touched) membersChanged++;
  });

  for (const l of log.slice(0, 40)) console.log('  ' + l);
  if (log.length > 40) console.log(`  … and ${log.length - 40} more`);
  console.log(`\n${changed} values on ${membersChanged} members disagree with the page they cite.` + (unreachable ? ` (${unreachable} pages unreachable)` : ''));

  if (!changed) return;
  if (APPLY) {
    writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');
    console.log('✓ Rewritten to match the cited sources.');
  } else {
    console.log('Re-run with --apply to write.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
