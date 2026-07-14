/**
 * Data-manager step: small, source-agnostic DATA-QUALITY normalisations applied
 * after enrichment. Idempotent — safe to run repeatedly.
 *
 *  1. Party field: strip a leaked role prefix ("(National) (Working) President /
 *     Chairman / Leader of <Party>") down to the actual party name, so the party
 *     chip reads "Telugu Desam Party", not a job title.
 *  2. Age fact: drop a birth year that implies an impossible age for a sitting
 *     legislator (under 21 — the constitutional floor is 25 — or over 105). Such
 *     a value is a source error; we remove it rather than display it.
 *
 * Usage:  npm run dm -- normalize-fields
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Politician } from '../../lib/types';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SEED = resolve(ROOT, 'data', 'seed', 'politicians.json');

const ROLE_PREFIX = /^(?:the\s+)?(?:national\s+|state\s+|working\s+|deputy\s+|vice[-\s]?)*(?:president|chairman|chairperson|leader|conve?nor|general secretary|secretary)\s+of\s+(?:the\s+)?(.+)$/i;

function main() {
  const pols: Politician[] = JSON.parse(readFileSync(SEED, 'utf8'));
  let partyFixed = 0, agesDropped = 0;

  for (const p of pols) {
    if (p.party) {
      const m = p.party.match(ROLE_PREFIX);
      if (m && m[1].length >= 4) { p.party = m[1].trim(); partyFixed++; }
    }
    if (p.facts?.length) {
      const before = p.facts.length;
      p.facts = p.facts.filter((f) => {
        if (f.field_type !== 'age') return true;
        const m = /age\s+(\d+)/i.exec(f.value);
        if (!m) return true;
        const age = parseInt(m[1], 10);
        return age >= 21 && age <= 105;
      });
      agesDropped += before - p.facts.length;
    }
  }

  writeFileSync(SEED, JSON.stringify(pols, null, 2) + '\n');
  console.log(`✓ normalize-fields: cleaned ${partyFixed} party fields, dropped ${agesDropped} impossible-age facts.`);
}

main();
