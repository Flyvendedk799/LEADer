# Mast3kmedia acquisition operations

## Run locally

Use Node 22.13 or later and PostgreSQL. Existing records are preserved by the migrations.

1. `npm install`
2. Configure `.env`, then `npm run db:local` if using the bundled local database.
3. `npm run setup` applies migrations without inserting demonstration data.
4. Start `npm run dev` and, separately, `npm run worker`.
5. Register/sign in. In Settings, enter the company profile and connect search/AI providers.
6. Set daily AND monthly search/AI request allowances and reserved-spend budgets. Zero pauses paid calls. Conservative per-call USD reservations are charged before requests; adjust them for the selected provider/model. Reservations are estimates. The usage ledger records provider/model and reported tokens; use invoice reconciliation to record attributable actual USD costs. Budget checks use the higher of each reservation and reconciled cost. This is a request and reserved-spend limit, not a guarantee that an unreported provider invoice cannot exceed the estimate.

Demo records are opt-in: `npm run db:seed`. Mock AI is also opt-in via `DEMO_MODE=true`; it must not be enabled for operational data.

## Hosted runtime

`docker compose --profile full up --build` runs web, PostgreSQL and a persistent worker. Set stable `AUTH_SECRET` and `AI_KEYS_ENCRYPTION_SECRET` values, a random URL-safe `POSTGRES_PASSWORD`, and the public HTTPS `NEXTAUTH_URL`. `npm start`, `npm run dev` and `npm run worker` apply versioned migrations before starting and stop on a migration failure. Docker uses the same startup command; it does not use `db push`. The worker waits for the web health check before starting. A production reverse proxy must terminate HTTPS. Do not expose the database publicly.

Vercel uses `npm run build:deploy` from `vercel.json` to migrate its configured database before building the release. Other hosts should use `npm start` (not `next start` directly), or run `npm run db:migrate:deploy` in their release step. Plain `npm run build` remains available for database-independent builds. After deploying this fix, existing databases receive the missing `User.companyProfile` column and the other pending migrations; no account reset or reseeding is needed.

Discovery run rows are the queue. Workers claim atomically with PostgreSQL `FOR UPDATE SKIP LOCKED`, refresh 90-second leases every 15 seconds, and stop if heartbeat renewal fails. Discovery resumes after a crashed lease expires. Transient discovery failures retry up to three claims with backoff. Interrupted workflows require inspection before retry because a workflow may have already created drafts/tasks. A browser reload never steals a running worker's job. Search plans and completed results are checkpointed before ingestion; recovered missions reuse saved results. A crash before the result checkpoint may repeat paid requests, within the remaining allowance. Candidate writes check the active lease transactionally.

The worker schedules a daily public-source sweep at the configured Copenhagen hour (07:00 by default) and runs configured automation presets. On initial setup it installs EHSYS procurement, dba consult assignments and Need Consult open assignments when their URLs are absent. It records completion of setup so deleting a starter source does not recreate it. With explicit search allowances and a configured provider, it schedules active automated discovery lanes once per day. Paused lanes remain paused. Company settings control daily scheduling and a separate international remote stream; International searches also remain available through Discover.

Settings and Today show worker heartbeat, provider configuration, source failures, queue age and request usage. Configuration presence does not prove a remote credential is valid: the first real run reports provider failures. The scheduler checks source frequencies every minute, including hourly scans, without waiting for the daily search hour. Failed source scans remain visible and can be retried manually; scheduled retries occur at most once per hour. Existing source-management controls and automation presets manage source frequencies and follow-up schedules.

## Data behavior

All public source scans and bulk imports produce review candidates. Acceptance creates a deal and follow-up task transactionally. Candidate harvest only shortlists; it never accepts leads. Rediscovery preserves reviewed/dismissed/saved records and appends distinct evidence. Existing historical Opportunity records and linked deals remain available; no destructive legacy migration is performed.

CSV import supports quoted multiline cells, column mapping and preview. Community confirmation retains its established explicit acceptance flow. Public PDFs are limited to 2 MB, 40 pages and 20,000 extracted characters. Image-only, oversized and unreadable documents remain visibly unverified.

Evidence cards expose field-level quotes for title, buyer, scope, amount, deadline, submission route and contact when the text supports the value. Unsupported values remain unverified, and missing values remain unknown. Owner corrections create separate evidence notes. Danish date-only deadlines and corrections use Europe/Copenhagen. Hourly/day rates are distinguished from project values.

The daily sweep rechecks up to ten open deal sources, retains new evidence and creates review tasks for changed/expired deadlines or unreadable pages without overwriting owner fields.

Draft editing saves a new version with parent-version provenance; originals are retained. Outreach is copied/downloaded and sent externally. Recording contact/submission creates an idempotent touchpoint and a dated follow-up; LEADer sends no outreach.

The operations panel reports source acceptance, contact, proposal, win/loss and average days to win. Outcome timestamps are recorded by the database across all update paths; historical closed deals have unknown closure dates and are excluded from duration averages. Costs for calls that lack token reporting remain explicitly unknown.

## Review-queue quality rules

- **Supplier fit** (`src/lib/crm/supplier-fit.ts`) scores whether a small studio can realistically deliver a lead, from its title and summary: IT infrastructure/outsourcing (cap 35), standard products/SaaS licences (cap 50), consultant-hour frameworks (cap 55), frameworks (cap 60), operations contracts (cap 65), heavy EU procedures (cap 70), contract value above 3M DKK, and guide/grant-scheme titles (cap 25). Custom build scope earns a small bonus and softens product/framework penalties, never infrastructure or staffing. Open candidates are rescored once per `SUPPLIER_FIT_VERSION`.
- **Concrete opportunity pages**: web lanes (and Funded work) reject front pages, short top-level pages without a stated need, listing/search/category/career/pagination pages, articles, guides, grant-scheme and Q&A pages, judged by address shape and title rather than platform lists.
- **Lane ownership of tenders**: public tender notices found by web lanes, and by Funded work without funding evidence, move to Tenders / procurement. Funded work no longer reads the udbud.dk index.
- **Cross-lane dedupe**: dedupe keys no longer depend on the lane; a tender with buyer, title and deadline, or the same URL, is one lead. The best-scoring copy stays (tie: Tenders lane, then newest).
- **Expiry**: NEW candidates whose deadline passed more than a day ago are dismissed (`Auto-dismissed: deadline passed`).
- **Lane rotation**: scheduled missions are queued least-recently-successful lane first, below manual runs, so allowance exhaustion never starves the same lanes.

These run in `maintainDiscoveryCandidates()` after each mission and when Discover/Workflows/run history load.

## Verification and remaining release gates

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npm run check:acquisition`: creates isolated test owners in the configured database and removes them afterward; verifies claims, recovery, fencing, cancellation, dedupe, owner separation, manual acceptance and concurrent usage limits.
- `npm run check:startup`: after building, creates an isolated local database at the pre-acquisition schema, reproduces the missing-column error, starts the actual production command and verifies migration plus login with the existing account.
- `npm run check:browser`: after `npm run build`, creates a dedicated local test database, applies migrations and seeds, runs Playwright with a real worker, then removes only that database. Run `npx playwright install chromium` once. `npm run test:e2e` remains the CI entry point.
- `npm run check:restore`: uses a local database and Docker PostgreSQL client to restore into a generated empty database, compare row counts and checksums across all tables, then remove its temporary database and dump.
- EHSYS, dba consult and Need Consult public lists were checked on 17 November 2026. Captured freelance-listing fixtures verify live markup, closed-listing exclusion and preservation of unknown buyers/deadlines. This is adapter validation, not a live discovery-quality benchmark.

For quality evaluation, download the candidate set from Settings → Discovery health, fill `expected`, `reviewedBy` and `rationale`, and run `npm run evaluate:discovery -- reviewed-examples.json`. The command requires at least 60 reviewed examples, positive and negative coverage of every automated lane, and 80% precision/recall per lane. It exits unsuccessfully for missing labels, insufficient coverage or failed thresholds. It measures qualification on retrieved candidates, not recall over the entire web. Search checkpoints include candidates rejected by the final lane guard so false negatives can be reviewed.

External release gates remain: owner-reviewed quality results, real paid-provider validation within an approved budget, and a seven-day hosted pilot. Agency prospects use the public-search lane and must be verified as actual subcontracting needs; a directory entry is not an advertised assignment. No production hosting target or spending limit was provided in this session, so no deployment, paid discovery or pilot result is claimed. Provider invoice costs are reconciled manually; unsupported token counts and field citations remain unknown rather than fabricated.

## Verified in this change

- 576 unit tests and 29 Chromium browser tests passed.
- Typecheck, lint and the production Next.js build passed.
- Real PostgreSQL integration checks covered concurrent claims, recovery, stale-worker write rejection, checkpoint reuse, cancellation, deduplication, owner isolation, acceptance, follow-ups, outcome timestamps and budget limits.
- Backup/restore checks matched counts and checksums across all 39 public tables.
- The production Docker image applied migrations to an empty isolated database, served healthy web/worker endpoints and completed a durable queued workflow. Environment files were absent from the image.
- The application fetch/parser path read 1 EHSYS listing, 10 DBA assignments and 5 open Need Consult assignments on 17 November 2026. These counts are not a relevance or availability guarantee. The managed test environment required its configured outbound proxy and trusted CA.

## Backup and restore

Use `pg_dump --format=custom` against the configured database; keep the encryption secret separately in your secret manager. Store backups off-host. Before upgrading, take a backup and verify `pg_restore --list`. Restore into a separate empty database with `pg_restore --no-owner`, run `prisma migrate deploy`, and check owner counts, deals, evidence, drafts and provider credential decryption before switching the application. Never test restoration over the live database.

## Container builds behind a trusted proxy

Normal builds use the base image's trusted CAs. If your environment uses a private trusted proxy, pass its CA bundle as a BuildKit secret: `docker build --secret id=ca_bundle,src=/path/to/trusted-ca-bundle.pem -t leader .`. The bundle is mounted only for build steps; TLS verification remains enabled. `.dockerignore` excludes environment secrets, local database data, browser sessions and exports from the build context.
