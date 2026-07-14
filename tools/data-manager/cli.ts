// Local-only data-manager CLI. Run with: npm run dm -- <command>
//   validate   check every fact is cited and the dataset is consistent
//   stats      dataset summary
//   publish    push politicians + constituencies to Firestore (needs creds)
//   import     rebuild the seed from a sourcing-workflow output JSON
//                 npm run dm -- import <path-to-output.json>
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { validateDataset, datasetStats, publishDataset } from './publish';

async function main() {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'validate': {
      const { issues, ok } = validateDataset();
      if (issues.length === 0) console.log('✓ No issues. Dataset is clean.');
      for (const i of issues) {
        console.log(`${i.severity === 'error' ? '✗ ERROR' : '⚠ warn '}  ${i.name}: ${i.message}`);
      }
      console.log(ok ? '\n✓ No blocking errors — safe to publish.' : '\n✗ Fix errors before publishing.');
      process.exit(ok ? 0 : 1);
      break;
    }
    case 'stats': {
      console.log(datasetStats());
      break;
    }
    case 'publish': {
      const { ok } = validateDataset();
      if (!ok) {
        console.error('✗ Validation failed. Run "npm run dm -- validate" and fix errors first.');
        process.exit(1);
      }
      console.log('Publishing to Firestore…');
      const res = await publishDataset();
      console.log(
        `✓ Published ${res.politicians} politicians, ${res.constituencies} constituencies, ` +
          `${res.central_government} ministers, ${res.office_seats} office seats.`,
      );
      break;
    }
    case 'refresh-mps': {
      // Rebuild the national Lok Sabha roster from the canonical ECI-sourced list.
      process.argv[2] = process.argv[3] || ''; // optional cached wikitext path
      await import('./import-lok-sabha');
      break;
    }
    case 'import-rajya-sabha': {
      // Add the ~245 Rajya Sabha members (upper house) from the canonical list.
      await import('./import-rajya-sabha');
      break;
    }
    case 'import-mlas': {
      // Add ~4,100 MLAs from each state assembly's Wikipedia members roster.
      process.argv[2] = process.argv[3] || '';
      await import('./import-mlas');
      break;
    }
    case 'import-mlcs': {
      // Add the ~426 sitting MLCs (Legislative Council members) across the 6
      // states that have an upper house, from each council's Wikipedia roster.
      await import('./import-mlcs');
      break;
    }
    case 'enrich-mps': {
      // Add cited per-member detail (bio, career, photo) from Wikidata.
      await import('./enrich-mps');
      break;
    }
    case 'enrich-wikidata': {
      // General Wikidata enrichment across ALL tiers (MPs, RS, MLAs, MLCs):
      // resolve missing QIDs + fill bio/career/photo gaps, cited, fill-only.
      await import('./enrich-wikidata');
      break;
    }
    case 'enrich-affidavits': {
      // Add declared assets/liabilities/criminal cases from MyNeta (ADR).
      await import('./enrich-affidavits');
      break;
    }
    case 'enrich-affidavits-states': {
      // Same, for sitting MLAs from each state-assembly election (name-guarded).
      await import('./enrich-affidavits-states');
      break;
    }
    case 'normalize-fields': {
      // Post-enrichment data-quality cleanup (party role prefixes, bad ages).
      await import('./normalize-fields');
      break;
    }
    case 'import-state-gov': {
      // Build state_government.json from the ryp-state-governments workflow output.
      process.argv[2] = process.argv[3] || '';
      await import('./import-state-gov');
      break;
    }
    case 'import': {
      const path = process.argv[3];
      if (!path) {
        console.error('Usage: npm run dm -- import <path-to-workflow-output.json>');
        process.exit(1);
      }
      // Delegate to the importer (writes data/seed/*.json).
      process.argv[2] = path; // importer reads argv[2] as the input path
      await import('./import-workflow-output');
      break;
    }
    default:
      console.log(`rankyourpolitician data manager

Commands:
  npm run dm -- validate            Check citations + consistency
  npm run dm -- stats               Dataset summary
  npm run dm -- publish             Publish to Firestore (needs .env.local creds)
  npm run dm -- refresh-mps         Rebuild the all-India Lok Sabha roster (543 seats) from the ECI-sourced list
  npm run dm -- import <file.json>  Rebuild seed from a sourcing-workflow output
  npm run dm:dashboard              Open the local review dashboard (http://localhost:4321)
`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
