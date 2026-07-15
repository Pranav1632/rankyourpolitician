// Local-only data-manager CLI. Run with: npm run dm -- <command>
//   validate   check every fact is cited and the dataset is consistent
//   stats      dataset summary
//   publish    push politicians + constituencies to Firestore (needs creds)
//   import     rebuild the seed from a sourcing-workflow output JSON
//                 npm run dm -- import <path-to-output.json>
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { validateDataset, datasetStats, publishDataset, requestSiteRevalidation } from './publish';

async function main() {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'validate': {
      const { issues, ok } = validateDataset();
      if (issues.length === 0) console.log('✓ No issues. Dataset is clean.');
      for (const i of issues) {
        console.log(`${i.severity === 'error' ? '✗ ERROR' : '⚠ warn '}  ${i.name}: ${i.message}`);
      }
      console.log(ok ? '\n✓ No blocking errors - safe to publish.' : '\n✗ Fix errors before publishing.');
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
      await requestSiteRevalidation();
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
    case 'verify-wikidata': {
      // Re-validate every stored QID against the record (constituency/house/
      // party evidence); strip wrong photos + QID-cited facts on failure.
      await import('./verify-wikidata');
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
    case 'verify-affidavits': {
      // Read-only audit: does each affidavit fact still match the page it cites,
      // and is that page really about our member?
      await import('./verify-affidavits');
      break;
    }
    case 'enrich-affidavits-byseat': {
      // Gap-filler for both of the above: walks MyNeta's PER-SEAT pages, which
      // (unlike its summary lists) also cover candidates whose figures are
      // rendered as images. Fill-only, so run it after the two steps above.
      await import('./enrich-affidavits-byseat');
      break;
    }
    case 'normalize-fields': {
      // Post-enrichment data-quality cleanup (party role prefixes, bad ages).
      await import('./normalize-fields');
      break;
    }
    case 'link-ministers': {
      // Link CoM records (CMs, state ministers) to their real MLA/MP profiles.
      await import('./link-ministers');
      break;
    }
    case 'enrich-performance': {
      // Official Digital Sansad metrics: attendance / questions / debates for MPs.
      await import('./enrich-performance');
      break;
    }
    case 'verify-attendance': {
      // Independently re-derive every stored attendance/questions/debates figure
      // from the official Digital Sansad APIs and diff it against the seed.
      await import('./verify-attendance');
      break;
    }
    case 'import-contact-channels': {
      // Verified helplines/grievance portals from the research workflow, gated on
      // an official source, into data/seed/contact_channels.json.
      await import('./import-contact-channels');
      break;
    }
    case 'discover-district-portals': {
      // Official district website + Who's Who/contact page per district, so the
      // escalation ladder always has a real place to go even with no named DM.
      await import('./discover-district-portals');
      break;
    }
    case 'update-all': {
      // Orchestrator: pull latest from every source, rebuild indexes, validate.
      await import('./update-all');
      break;
    }
    case 'backfill-trending': {
      // Rebuild trending daily buckets from the votes collection - covers votes
      // cast before the trending feature shipped. Dry-run unless --apply.
      await import('./backfill-trending');
      break;
    }
    case 'rebuild-indexes':
    case '--rebuild-indexes': {
      // Regenerate the static search-index.json + who/*.json from the seed.
      await import('../build-search-index');
      await import('../build-who-data');
      break;
    }
    case 'enrich-photos': {
      // Raise photo coverage from Hindi/regional-Wikipedia lead images (Commons).
      await import('./enrich-photos');
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
