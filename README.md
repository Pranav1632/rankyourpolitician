# RankYourPolitician

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

**Live: [www.rankyourpolitician.com](https://www.rankyourpolitician.com)**

An open-source, **non-partisan** civic platform for India: know **who represents your area**,
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

## Table of contents

- [What's in the dataset](#whats-in-the-dataset)
- [Quick start](#quick-start)
- [Tech stack](#tech-stack)
- [How data flows](#how-data-flows)
- [Project structure](#project-structure)
- [The local Data Manager](#the-local-data-manager-never-deployed)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Languages](#languages)
- [Legal notes for operators (India)](#legal-notes-for-operators-india)
- [License](#license)

## What's in the dataset

| | Count |
|---|---|
| Elected representatives | **5,266** - 543 Lok Sabha · 245 Rajya Sabha · 4,100 MLAs · 378 MLCs |
| Cited facts | **30,847** (every one carries a source URL + retrieved date) |
| Constituencies | 4,643 across 36 states & UTs (598 districts) |
| Union government | 71 ministers · 5 constitutional offices (President, VP, Speaker, LoPs) |
| State governments | 31 councils of ministers (571 ministers) |
| Escalation contacts | 495 district portals · 14 national + 36 state helplines |

Facts come from Election Commission of India affidavits, Digital Sansad, PRS Legislative Research
and Wikidata. **No citation, no claim** - this is enforced by `npm run dm -- validate`, which fails
on any fact missing a `source_url`.

## Quick start

Requires **Node.js 18.18+**.

```bash
git clone https://github.com/ForPublicOrg/rankyourpolitician.git
cd rankyourpolitician
npm install
npm run dev          # http://localhost:3000 - serves the seed, no credentials needed
```

`npm run build` runs a `prebuild` step first that generates the static payloads in `public/`
(search index, rankings, who-does-what data) from the seed.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19, TypeScript), ISR-cached |
| Styling | Tailwind CSS |
| Database | **Firebase Firestore**, server-side **Admin SDK only** (no client SDK) |
| Map | `d3-geo` SVG choropleth, DataMeet-compliant GeoJSON, projected server-side |
| Vote integrity | Cloudflare **Turnstile** + device signal + **Upstash** rate-limit + salted-hash dedupe |
| Hosting | Vercel (any host that runs Next.js works) |

## How data flows

The architecture exists so every page is a CDN cache hit, not a server render. This is the most
important thing to understand before changing `lib/data.ts`:

- **Politician, constituency and government data is served from the committed seed**, never read
  from Firestore at request time. It only changes when you run the data manager and redeploy, so
  a database round-trip would buy nothing.
- **Firestore is read at runtime for one thing: live vote aggregates.**
- **Every runtime Firestore read is TTL-memoised in-process** (`ttlCache` in `lib/data.ts`):
  vote aggregates refresh at most every 5 minutes, government collections every 30 minutes, per
  warm instance. The cache stores the *promise*, so a burst of concurrent requests shares one load
  instead of stampeding the database.
- **ISR sits on top, but only as a slow self-heal** (`revalidate = 86400` on the hub pages,
  `604800` on the person/area/district/state long tail). Pages are served straight from the
  CDN cache; with ~10.6k crawlable long-tail pages, the old daily window meant crawler
  revisits re-rendered the whole tail every day - most of the ISR-writes bill - for data
  that only changes via publish or deploy.
- **Freshness is handled where the data actually changes, not by re-rendering everything:**
  - *Votes* - `VoteWidget` re-fetches the live score from `GET /api/vote` on mount
    (CDN-cached 5 min, served from the in-process aggregate cache: zero extra Firestore
    reads). The static HTML can be up to a day old; the numbers on screen never are.
  - *Trending* - the home page's "Trending" tab (the default view of the Top-leaders card)
    fetches `GET /api/trending` on mount (CDN-cached 5 min). The vote transaction keeps
    per-day buckets of first-time votes on each aggregate doc (`daily`, pruned to 14 days),
    and trending is derived from the same in-process aggregate cache: a 7-day window,
    exponential decay (3-day half-life) so recency beats raw bulk, and a 3-vote floor so one
    drive-by rating never trends. Ordering is by decayed activity only - the rating displayed
    is the leader's real one (the same all-time plain average their profile shows), and the
    list is labelled attention, not a verdict. All rules live in `lib/trending.ts`.
    State and district pages reuse the same card: their Top-leaders card carries the same
    Trending tab, scoped via `?state=` / `&district=` params. Scoping filters the same
    in-process aggregates (zero extra Firestore reads), each scope is its own CDN cache
    key, and on those pages the fetch fires only when the card scrolls into view. A row
    can carry an up/down arrow - this week's new-vote mean vs the leader's own all-time
    mean, shown only past a 0.2 threshold so noise never draws an arrow.
  - *Data publishes* - `npm run dm -- publish` calls `POST /api/revalidate` (Bearer
    `REVALIDATE_SECRET`), which sweeps the page cache; each page regenerates on its next
    visit. A page that regenerates within ~30 min of a publish can still bake the previous
    in-process TTL snapshot - run `npm run dm -- revalidate` again ~35 min after the publish
    to re-sweep those (the timed revalidate remains the backstop).
  - *Seed changes* still require a redeploy, which resets the whole cache anyway.
- **Nothing reads Firestore during `next build`** - prerendering ~5,300 person pages would
  flood the database with reads on every deploy for data the seed already has. Override with
  `FORCE_FIRESTORE_AT_BUILD=1`.

Consequence: a voter sees their own score update instantly (the API returns it), but the
score other visitors see can lag a vote by up to ~10 minutes (5 min CDN cache on the
sentiment GET + 5 min aggregate TTL). That is by design, not a bug.

## Project structure

```
app/
  [lang]/                     every page, statically generated once per locale
    page.tsx                  home
    india/  hierarchy/        union government, full org chart
    state/[state]/            state view (assembly composition, district map)
    district/[state]/[district]  district view + escalation ladder + officials
    area/[constituency]/      constituency view
    person/[id]/              unified profile (MP/MLA and/or minister, or appointed official)
    rankings/  search/  who/  full rankings, search, "who fixes what"
    accountability/ methodology/ about/ privacy/ terms/ grievance/
  api/vote/                   vote endpoint (POST: Turnstile + rate-limit + Firestore
                              transaction; GET: live sentiment for the widget, CDN-cached)
  api/trending/               trending leaders (decayed 7-day rating activity, optional
                              state/district scope, CDN-cached, zero extra Firestore reads)
  api/revalidate/             on-demand cache sweep after `dm publish` (Bearer secret)
  api/health/                 liveness probe (zero Firestore reads)
middleware.ts                 locale routing: rewrites clean URLs to /{locale}/... from the
                              `lang` cookie, so pages stay static per locale
components/                   UI (map, search, ranking, vote widget, i18n switcher, …)
lib/                          types, data layer, ranking + trending math, i18n, geo, vote integrity
lib/i18n/messages/            en.json (source of truth) + per-locale overrides
data/seed/                    committed dataset (9 JSON files - politicians, constituencies,
                              central/state government, constitutional offices, district
                              officials, district portals, contact channels, criminal cases)
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
npm run dm -- revalidate               # re-sweep the deployed page cache (~35 min after a publish)
npm run dm -- update-all               # orchestrator: refresh every source, rebuild, validate
npm run dm -- rebuild-indexes          # regenerate static search/who payloads from the seed
npm run dm -- backfill-trending        # rebuild trending buckets from vote records (--apply)
npm run dm:dashboard                   # review UI at http://localhost:4321
```

Sourcing and enrichment commands (all cite what they write):

```
refresh-mps                 Rebuild the Lok Sabha roster (543 seats) from the ECI-sourced list
import-rajya-sabha          import-mlas          import-mlcs          import-state-gov
import-contact-channels     discover-district-portals                 import <file.json>
enrich-mps                  enrich-wikidata      enrich-affidavits    enrich-affidavits-states
enrich-performance          enrich-photos        link-ministers       normalize-fields
verify-wikidata             verify-attendance    fetch-criminal-cases
```

`fetch-criminal-cases` fills `data/seed/criminal_cases.json`: the case-by-case detail (FIR/case
number, court, sections, charges-framed status, convictions with punishment and appeal state)
behind every `criminal_cases_declared` fact, read verbatim from the exact affidavit page that fact
already cites. It never does person-matching of its own - a page is accepted only if its title
still names the member (or their seat), otherwise the member is skipped and reported. `validate`
blocks publish if a detail record disagrees with its count fact or cites a different page.

Run `npm run dm` with no arguments for the built-in help.

## Configuration

Everything is optional for local development - the site runs entirely from the seed with no
environment variables. `.env.example` documents every variable.

### Live data (Firebase)

1. Create a Firebase project → enable **Firestore** (production mode).
2. Project Settings → Service accounts → **Generate new private key**. Save it locally (git-ignored).
3. In `.env.local` set `FIREBASE_SERVICE_ACCOUNT_JSON` (one-line JSON) **or** `GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json`.
4. Deploy the rules: `firebase deploy --only firestore:rules`.
5. `npm run dm -- publish`.

> `firestore.rules` is **deny-all by design** - the app only ever reaches Firestore through the
> server-side Admin SDK, which bypasses rules. Public read rules would let anyone who learns the
> project id enumerate the dataset (and hammer the database) from a browser.

> ⚠️ Point `.env.local` at a **separate dev Firebase project** if you can. Otherwise `npm run dev`
> writes real votes into production data.

### Voting integrity (do this before you take real traffic)

- **Cloudflare Turnstile**: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`
  (both, in the same deploy - the site key is inlined at build time).
- **Upstash Redis**: set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- Set a strong `VOTE_HASH_SALT` (`openssl rand -hex 32`).

Without Turnstile the vote endpoint runs in **dev mode: it accepts every vote with no bot check**
and responds with `"dev": true`. Without Upstash, rate limiting falls back to per-instance memory,
which does not hold across serverless instances. Both are fine locally; neither is fine in public.

Privacy: raw IPs and fingerprints are **never stored**. The vote dedupe key is a salted SHA-256 of
a coarsened IP (/24 or /48) plus a device signal - see `lib/vote-integrity.ts`.

## Deployment

The site deploys as a standard Next.js app. On Vercel: import the repo, add the env vars from
`.env.example`, deploy. `tools/` is excluded from the build.

Remember that `NEXT_PUBLIC_*` variables are inlined at **build time** - adding one to the host's
dashboard does nothing until the next build actually runs.

## Contributing

Issues and PRs welcome - corrections to the data are especially welcome. Three ground rules
apply to **every** change; [CLAUDE.md](CLAUDE.md) spells them out with the architecture notes:

1. **Never trade away speed or user experience.** Every page stays static/ISR and CDN-served:
   no `cookies()`/`headers()` in a render path, no per-request Firestore reads, no blocking
   third-party scripts, big lists precomputed and lazy-loaded rather than embedded in pages.
   A change that makes first paint slower or payloads heavier needs a very strong reason.
2. **No personal data collection.** The site stores nothing about its visitors: no accounts,
   no emails, no raw IPs or fingerprints (vote dedupe is a salted hash of coarsened signals,
   and stays that way), no trackers beyond the single analytics mount on the home page.
   PRs adding PII storage or profiling scripts will be declined.
3. **Everything is for the public.** Open, MIT-licensed, login-less, non-partisan. Every fact
   cited to an official public source; features must work for an anonymous visitor on a cheap
   phone. Nothing lands behind a paywall or an account.

Practical checklist:

- **Found a wrong fact?** Open an issue with the profile URL and an official source. Facts without
  a citation cannot be merged; see `/methodology` for what counts as a source.
- **Code:** run `npm run typecheck` before opening a PR.
- **Data changes** go through `npm run dm -- validate` - a PR that fails validation will not build.
- **Neutrality is the bar:** the objective layer stays factual, dated and source-cited. No guilt
  inferences ("N cases declared", never "criminal").

## Languages

`lib/i18n/messages/en.json` is the source of truth. Add `xx.json` for locale `xx` (any subset of
keys; missing keys fall back to English). The switcher lists all 22 Eighth-Schedule languages +
English. Translation PRs are a great first contribution.

## Legal notes for operators (India)

Anyone running a public deployment of this politically sensitive, public-figure site should
**get a one-time review by an Indian lawyer** (geospatial + media/IT + data-protection):

- [ ] **Map:** verify J&K, Ladakh (Aksai Chin) and Arunachal render as Indian with no dispute markings, at every zoom. Never swap in GADM/Natural Earth/OSM basemaps.
- [ ] **Grievance Officer (IT Rules 2021):** name and a real monitored mailbox are published on `/grievance` (both come from `lib/site-contact.ts`, overridable via `NEXT_PUBLIC_GRIEVANCE_EMAIL`). Outstanding is the operational duty, not the plumbing: honour 24h ack / ~15-day resolution, and keep the mailbox out of spam.
- [ ] **Defamation (BNS s.356):** keep the objective layer to official-sourced, dated, neutral facts; no guilt inferences. Keep the right-to-reply prominent.
- [ ] **DPDP Act 2023:** publish the privacy policy; store only salted hashes for vote dedupe; add a pre-vote consent notice; rotate the salt; don't retain raw IP/fingerprint.

## License

MIT (code) - see [LICENSE](LICENSE).

Data sources retain their own licences: map boundaries from DataMeet (CC BY), identity references
from Wikidata (CC0), facts from ECI affidavits, Digital Sansad and PRS Legislative Research, each
cited per datapoint.
