/**
 * Data-manager ORCHESTRATOR: pull the latest data from every source and rebuild
 * everything in one go. This is what the dashboard's "Update all data" button
 * runs, and what you run on a schedule to keep the site fresh.
 *
 * Order matters: enrich the seed from each source (fill-only, except performance
 * which is refreshed), then LINK ministers, normalise, rebuild the static search
 * + who indexes, and validate. Each step is isolated in its own process so one
 * source being down does not abort the rest; a summary reports what succeeded.
 *
 * Sources & endpoints (all verified live):
 *   - Wikidata / Wikimedia Commons  → bio, education, career, photos, QIDs
 *   - Hindi + regional Wikipedias    → additional free-licensed photos
 *   - MyNeta / ADR                   → election-affidavit assets/criminal/education
 *                                      (Lok Sabha + the current state assemblies)
 *   - Digital Sansad (sansad.in)     → MP attendance / questions / debates
 *
 * Usage:  npm run dm -- update-all               (everything, performance refreshed)
 *         npm run dm -- update-all --skip-heavy  (skip the slow Wikidata/photo scans)
 *         npm run dm -- update-all --only=enrich-performance,enrich-affidavits-states
 *         npm run dm -- update-all --no-refresh  (performance fills gaps only)
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const CLI = resolve(ROOT, 'tools', 'data-manager', 'cli.ts');

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const onlyArg = argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim())) : null;
const skipHeavy = has('--skip-heavy');
const refresh = !has('--no-refresh');

interface Step { name: string; cmd: string; env?: Record<string, string>; heavy?: boolean }
const STEPS: Step[] = [
  { name: 'Wikidata bio / career / photos / QIDs', cmd: 'enrich-wikidata', heavy: true },
  { name: 'Verify stored QIDs (strip wrong photos/facts)', cmd: 'verify-wikidata', heavy: true },
  { name: 'Extra photos (Hindi + regional Wikipedia)', cmd: 'enrich-photos', heavy: true },
  { name: 'Affidavits - Lok Sabha (MyNeta/ADR)', cmd: 'enrich-affidavits' },
  { name: 'Affidavits - state assemblies (MyNeta/ADR)', cmd: 'enrich-affidavits-states' },
  { name: 'Performance - MPs (Digital Sansad)', cmd: 'enrich-performance', env: refresh ? { PERF_REFRESH: '1' } : {} },
  { name: 'Link ministers → real profiles', cmd: 'link-ministers' },
  { name: 'Data-quality normalisation', cmd: 'normalize-fields' },
];

function run(label: string, args: string[], env: Record<string, string> = {}): boolean {
  const bar = '─'.repeat(Math.max(4, 60 - label.length));
  console.log(`\n\x1b[1m▶ ${label}\x1b[0m ${bar}`);
  const r = spawnSync('npx', ['tsx', CLI, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  const ok = r.status === 0;
  console.log(ok ? `\x1b[32m✓ ${label}\x1b[0m` : `\x1b[31m✗ ${label} (exit ${r.status})\x1b[0m`);
  return ok;
}

async function main() {
  console.log('RankYourPolitician - update all data from sources\n' + '='.repeat(56));
  const results: { name: string; ok: boolean; skipped?: boolean }[] = [];

  for (const s of STEPS) {
    if (only && !only.has(s.cmd)) { results.push({ name: s.name, ok: true, skipped: true }); continue; }
    if (skipHeavy && s.heavy) { console.log(`\n⏭  skipping heavy step: ${s.name}`); results.push({ name: s.name, ok: true, skipped: true }); continue; }
    results.push({ name: s.name, ok: run(s.name, [s.cmd], s.env) });
  }

  // Rebuild the static payloads the site serves, then validate citations.
  const rebuilt = run('Rebuild search + who indexes', ['--rebuild-indexes']);
  const valid = run('Validate dataset (citations + consistency)', ['validate']);

  console.log('\n' + '='.repeat(56) + '\nSUMMARY');
  for (const r of results) console.log(`  ${r.skipped ? '⏭ skipped' : r.ok ? '✓' : '✗ FAILED'}  ${r.name}`);
  console.log(`  ${rebuilt ? '✓' : '✗ FAILED'}  Rebuild indexes`);
  console.log(`  ${valid ? '✓' : '✗ FAILED'}  Validate`);
  const failed = results.filter((r) => !r.ok && !r.skipped).length + (rebuilt ? 0 : 1) + (valid ? 0 : 1);
  console.log(failed ? `\n${failed} step(s) failed - review the log above.` : '\n✓ All steps complete. Commit the seed + rebuilt indexes, then redeploy.');
  process.exit(failed ? 1 : 0);
}

main();
