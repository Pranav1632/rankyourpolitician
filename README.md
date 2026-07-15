# RankYourPolitician

**Live: [rankyourpolitician.com](https://rankyourpolitician.com)** · MIT licensed · contributions welcome

A free, open-source, **non-partisan** civic platform for India: know **who represents your area**,
**what each office is responsible for**, and **how they're performing** - every fact cited to an
official source, with a visible "last updated" date. Ranking is one part of an information-first
profile, never a verdict.

- **Drill down** National → State → District → Constituency on an interactive, Survey-of-India-compliant map.
- **Two independent axes:** *Verified Performance* (official data only) and *Public Sentiment* (login-less voting), computed **separately** so opinion can never move the factual measure.
- **Escalation ladders:** pick a problem ("potholes", "no water") and see the actual office responsible, how to complain, and how to escalate - from the local JE up to the Chief Minister.
- **Instant search** over every leader, area, district and party - answered in the browser, no server round-trip.
- **22 official languages + English** with a global switcher (English default).

> **Runs locally with zero setup.** With no Firebase credentials the site serves the committed
> seed dataset in `data/seed/` - the full all-India dataset below, not a stub.

## What's in the dataset

| | Count |
|---|---|
| Elected representatives | **5,263** - 540 Lok Sabha · 245 Rajya Sabha · 4,100 MLAs · 378 MLCs |
| Cited facts | **27,116** (every one carries a source URL + retrieved date) |
| Constituencies | 4,643 across 36 states & UTs (598 districts) |
| Union government | 71 ministers · 5 constitutional offices (President, VP, Speaker, LoPs) |
| State governments | 31 councils of ministers (571 ministers) |
| Escalation contacts | 495 district portals · 14 national + 36 state helplines |

Facts come from Election Commission of India affidavits, Digital Sansad, PRS Legislative Research
and Wikidata. **No citation, no claim** - this is enforced by `npm run dm -- validate`, which fails
on any fact missing a `source_url`.

## Quick start

```bash
git clone https://github.com/ForPublicOrg/rankyourpolitician.git
cd rankyourpolitician
npm install
npm run dev          # http://localhost:3000 - serves the seed, no credentials needed
```

`npm run build` runs a `prebuild` step first that generates the static payloads in `public/`
(search index, rankings, who-does-what data) from the seed.

## Stack (all free tiers)

| Concern | Choice |
|---|---|
| Framework / host | Next.js 15 (App Router, React 19, TS) on **Vercel**, ISR-cached |
| Styling | Tailwind |
| Database | **Firebase Firestore**, server-side **Admin SDK only** (no client SDK) |
| Map | `d3-geo` SVG choropleth, DataMeet-compliant GeoJSON, projected server-side |
| Vote integrity | Cloudflare **Turnstile** + device signal + **Upstash** rate-limit + salted-hash dedupe |
| Ads | Single non-intrusive AdSense slot (reserved height, no layout shift) |

## How data flows (and why the Firestore bill stays near zero)

This is the most important thing to understand before changing `lib/data.ts`:

- **Politician, constituency and government data is served from the committed seed**, never read
  from Firestore at request time. It only changes when you run the data manager and redeploy, so
  a database round-trip would buy nothing.
- **Firestore is read at runtime for one thing: live vote aggregates.**
- **Every runtime Firestore read is TTL-memoised in-process** (`ttlCache` in `lib/data.ts`):
  vote aggregates refresh at most every 5 minutes, government collections every 30 minutes, per
  warm instance. The cache stores the *promise*, so a burst of concurrent requests shares one load
  instead of stampeding the database.
- **ISR sits on top** (`revalidate = 300` on most pages), so rendering is cached too.
- **Nothing reads Firestore during `next build`** - prerendering the ~5,330 person pages would
  otherwise blow the free quota on a single deploy. Override with `FORCE_FIRESTORE_AT_BUILD=1`.

Consequence: a voter sees their own score update instantly (the API returns it), but a
page's public score can lag a vote by up to ~10 minutes. That is by design, not a bug.

## Project structure

```
app/                          Next.js routes
  page.tsx                    home
  india/  hierarchy/          union government, full org chart
  state/[state]/              state view (assembly composition, district map)
  district/[state]/[district] district view + escalation ladder + officials
  area/[constituency]/        constituency view
  person/[id]/                unified profile (MP/MLA and/or minister, or appointed official)
  rankings/  search/  who/    full rankings, search, "who fixes what"
  accountability/ methodology/ about/ privacy/ terms/ grievance/
  api/vote/                   vote endpoint (Turnstile + rate-limit + Firestore transaction)
  api/health/                 liveness probe (zero Firestore reads)
components/                   UI (map, search, ranking, vote widget, i18n switcher, …)
lib/                          types, data layer, ranking math, i18n, geo projection, vote integrity
lib/i18n/messages/            en.json (source of truth) + per-locale overrides
data/seed/                    committed dataset (8 JSON files - politicians, constituencies,
                              central/state government, constitutional offices, district
                              officials, district portals, contact channels)
data/geo/                     compliant simplified GeoJSON (states, districts, PCs, ACs)
tools/                        build-time static payload generators (search index, rankings, who)
tools/data-manager/           LOCAL-ONLY: validate / publish / enrich / import / dashboard
firestore.rules               deny-all (server-only access via Admin SDK)
```

Search deserves a note: there is **no search API**. `tools/build-search-index.ts` emits
`public/search-index.json` at build time; the browser fetches it once and answers every keystroke
locally in under 5ms.

## The local Data Manager (never deployed)

Runs on your machine with a Firebase service-account key that **stays local** (git-ignored).

```bash
npm run dm -- validate                 # check every fact is cited + consistent
npm run dm -- stats                    # dataset summary
npm run dm -- publish                  # push seed to Firestore (needs .env.local creds)
npm run dm -- update-all               # orchestrator: refresh every source, rebuild, validate
npm run dm -- rebuild-indexes          # regenerate static search/who payloads from the seed
npm run dm:dashboard                   # review UI at http://localhost:4321
```

Sourcing and enrichment commands (all cite what they write):

```
refresh-mps                 Rebuild the Lok Sabha roster (543 seats) from the ECI-sourced list
import-rajya-sabha          import-mlas          import-mlcs          import-state-gov
import-contact-channels     discover-district-portals                 import <file.json>
enrich-mps                  enrich-wikidata      enrich-affidavits    enrich-affidavits-states
enrich-performance          enrich-photos        link-ministers       normalize-fields
verify-wikidata             verify-attendance
```

Run `npm run dm` with no arguments for the built-in help.

## Enable live data (Firebase)

1. Create a Firebase project → enable **Firestore** (production mode).
2. Project Settings → Service accounts → **Generate new private key**. Save it locally (git-ignored).
3. In `.env.local` set `FIREBASE_SERVICE_ACCOUNT_JSON` (one-line JSON) **or** `GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json`.
4. Deploy the rules: `firebase deploy --only firestore:rules`.
5. `npm run dm -- publish`.

> `firestore.rules` is **deny-all by design** - the app only ever reaches Firestore through the
> server-side Admin SDK, which bypasses rules. Public read rules would let anyone who learns the
> project id enumerate the dataset from a browser and bill you for it.

> ⚠️ Point `.env.local` at a **separate dev Firebase project** if you can. Otherwise `npm run dev`
> writes real votes into production data.

## Enable voting integrity (do this before you take real traffic)

- **Cloudflare Turnstile** (free): set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`.
- **Upstash Redis** (free): set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- Set a strong `VOTE_HASH_SALT` (`openssl rand -hex 32`).

Without Turnstile the vote endpoint runs in **dev mode: it accepts every vote with no bot check**
and responds with `"dev": true`. Without Upstash, rate limiting falls back to per-instance memory,
which does not hold across serverless instances. Both are fine locally; neither is fine in public.

Privacy: raw IPs and fingerprints are **never stored**. The vote dedupe key is a salted SHA-256 of
a coarsened IP (/24 or /48) plus a device signal - see `lib/vote-integrity.ts`.

## Deploy to Vercel

Import the repo, add the env vars from `.env.example`, deploy. `tools/` is excluded from the build.

> ⚠️ **Vercel Hobby is non-commercial only.** The moment ads or donations go live the site counts as
> "commercial" - move to **Cloudflare Pages** (free, commercial allowed) or **Vercel Pro** first.

## Contributing

Issues and PRs welcome - corrections to the data are especially welcome.

- **Found a wrong fact?** Open an issue with the profile URL and an official source. Facts without
  a citation cannot be merged; see `/methodology` for what counts as a source.
- **Code:** run `npm run typecheck` and `npm run lint` before opening a PR.
- **Data changes** go through `npm run dm -- validate` - a PR that fails validation will not build.
- **Neutrality is the bar:** the objective layer stays factual, dated and source-cited. No guilt
  inferences ("N cases declared", never "criminal").

## Languages

`lib/i18n/messages/en.json` is the source of truth. Add `xx.json` for locale `xx` (any subset of
keys; missing keys fall back to English). The switcher lists all 22 Eighth-Schedule languages + English.

## ⚠️ Pre-launch legal checklist (India)

This is a politically sensitive, public-figure site. **Get a one-time review by an Indian lawyer**
(geospatial + media/IT + data-protection). Before going live:

- [ ] **Map:** verify J&K, Ladakh (Aksai Chin) and Arunachal render as Indian with no dispute markings, at every zoom. Never swap in GADM/Natural Earth/OSM basemaps.
- [ ] **Grievance Officer (IT Rules 2021):** name and a real monitored mailbox are published on `/grievance` (both come from `lib/site-contact.ts`, overridable via `NEXT_PUBLIC_GRIEVANCE_EMAIL`). Outstanding is the operational duty, not the plumbing: honour 24h ack / ~15-day resolution, and keep the mailbox out of spam.
- [ ] **Defamation (BNS s.356):** keep the objective layer to official-sourced, dated, neutral facts; no guilt inferences. Keep the right-to-reply prominent.
- [ ] **DPDP Act 2023:** publish the privacy policy; store only salted hashes for vote dedupe; add a pre-vote consent notice; rotate the salt; don't retain raw IP/fingerprint.
- [ ] **AdSense/Razorpay:** keep content strictly factual and non-partisan.

## License

MIT (code) - see [LICENSE](LICENSE).

Data sources retain their own licences: map boundaries from DataMeet (CC BY), identity references
from Wikidata (CC0), facts from ECI affidavits, Digital Sansad and PRS Legislative Research, each
cited per datapoint.
