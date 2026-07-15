/**
 * Data-manager step: ingest the district-officials sourcing-workflow output and
 * write data/seed/district_officials.json as OfficeSeat[] with incumbents.
 * ONLY high-confidence, official-source names are published (named serving
 * officials - caution first). Office contact only; never personal data.
 *
 * Usage: npx tsx tools/data-manager/import-district-officials.ts <path-to-output.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED_DIR = resolve(ROOT, 'data', 'seed');

function seat(stateCode: string, district: string, officeType: string, off: any) {
  const base = { id: `${stateCode}__${district}__${officeType}`, officeType, level: 'district', stateCode, district };
  if (off && off.name && off.confidence === 'high' && off.source_url) {
    return {
      ...base,
      incumbent: {
        name: off.name,
        service: off.service || undefined,
        office_email: off.office_email || undefined,
        office_phone: off.office_phone || undefined,
        source_url: off.source_url,
        source_name: off.source_name || off.source_url,
        as_of: off.as_of || undefined,
      },
    };
  }
  return base; // no incumbent → page shows "being verified"
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npx tsx tools/data-manager/import-district-officials.ts <path-to-output.json>');
    process.exit(1);
  }
  const doc = JSON.parse(readFileSync(inputPath, 'utf8'));
  const r = doc.result ?? doc;
  const out: any[] = [];
  const report: string[] = [];

  for (const d of r.districts || []) {
    const c = seat(d.stateCode, d.district, 'collector_dm', d.collector);
    const s = seat(d.stateCode, d.district, 'sp_district', d.sp);
    out.push(c, s);
    report.push(
      `${d.district} (${d.stateCode}): DC ${'incumbent' in c ? (c as any).incumbent.name : '- (being verified)'} | SP ${'incumbent' in s ? (s as any).incumbent.name : '- (being verified)'}`,
    );
  }

  writeFileSync(resolve(SEED_DIR, 'district_officials.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(report.join('\n'));
  const named = out.filter((x) => x.incumbent).length;
  console.log(`\nWrote ${out.length} office seats (${named} with a published high-confidence incumbent).`);
}

main();
