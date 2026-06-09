# LEADer — Implementation Plan (A→Z)

> Personal lead-intelligence platform for discovering, tracking, evaluating, saving and
> exporting funded startup work, voucher assignments, grant-backed supplier tasks,
> tender-like opportunities and community leads — **Denmark-first, global-ready.**

**Owner profile:** Fullstack developer · AI builder · MVP/prototype developer ·
product strategy & technical roadmap · automation consultant · startup/SME technical partner.
**Sweet spot:** active, directly-applicable assignments **under 100,000 DKK** with a clear deadline.

---

## 0. The six questions this product must answer "yes" to

| Question | How LEADer answers it |
|---|---|
| Can it help me find opportunities like funded startup projects? | Source Management + Discovery engine + Community Import normalise everything into one `Opportunity` model, AI-classified and scored. |
| Can I save & organise leads efficiently? | Watchlists, custom Lists, Tags, Saved Searches, Status pipeline, Priorities. |
| Can I act before the deadline? | `expiresAt`/`deadline` parsing, active/expired detection, deadline reminders, "needs action" queue, daily/weekly digest. |
| Can I export & reuse the data? | CSV / XLSX / PDF report / Markdown / Notion-ready exporters with a fixed field contract. |
| Is source ingestion legally compliant? | Hard separation of **Automated public-source discovery** vs **Manual/community import**; robots/ToS/rate-limit guards; no private-group scraping — ever. |
| Is it structured so I can extend it? | Modular `lib/` (ai, scoring, export, ingestion), provider-agnostic AI layer, typed contracts, clean folder structure, documented extension points. |

---

## 1. Product Vision

LEADer is a **single-power-user intelligence dashboard** that continuously surfaces small,
fundable, directly-applicable technical assignments (voucher projects, PoC/MVP builds,
AI/fullstack work, product-strategy gigs) from Danish innovation/funding ecosystems — and
lets the user triage them like an analyst: score, filter, watch, annotate, draft outreach,
and export.

It is built as a **SaaS-ready foundation** (multi-tenant-capable schema, modular services,
auth-ready) but optimised for **one user first**: zero-friction local dev, seedable demo data,
and no premature billing/paywall complexity.

**Design north star:** a Bloomberg-terminal-for-grants feel — clean, dense-but-calm, fast,
card+table+side-panel layout, status & score badges everywhere, one-click CTAs.

**Two worlds, one app:** a **Denmark** workspace (default) and a **Global** workspace
(separate tab) that share the same engine but filter by region so international tasks never
clutter the Danish view.

---

## 2. User Stories

### Discovery
- As the user, I add a **source** (URL, RSS, portal, accelerator page, newsletter, API, manual) with keywords/region/category/frequency so LEADer monitors it.
- As the user, I trigger or schedule **discovery runs** that fetch public pages/RSS, parse opportunity cards + detail pages, and store normalised opportunities.
- As the user, I see **only legally-fetched** automated results, clearly separated from things I imported manually.
- As the user, I never want LEADer to log into, scrape, or bypass a closed Facebook group.

### Community / Facebook (compliant)
- As the user, I **paste** a Facebook/group post (text + URL + author + date + group) and have AI extract a candidate lead.
- As the user, I use a **"save this post"** browser workflow concept (bookmarklet/manual capture) to push content into LEADer.
- As the user, I (later) upload a screenshot/text export and have OCR extract the lead.

### Triage & evaluation
- As the user, I see a **0–100 match score** per opportunity with a transparent breakdown and AI explanation of *why it's relevant*.
- As the user, I **filter** by budget, deadline range, active-only, source, category, score, status, tags, region, has-budget, application-route.
- As the user, I move leads through a **pipeline**: New → Interesting → Watch → Contacted → Applied → Won → Lost → Archived.
- As the user, I **save** leads to a Watchlist and to custom Lists, tag them, and set priority + reminders.

### Act
- As the user, I open a **detail page** with summary, extracted requirements, contacts, application requirements, attachments, notes, an activity timeline, and saved drafts.
- As the user, I **generate** an application draft, a supplier pitch, an outreach email, and an apply-checklist with one click.
- As the user, I get a **"next best action"** recommendation per lead.

### Export & monitor
- As the user, I **export** any list/filtered view to CSV, XLSX, PDF report, Markdown, Notion-ready.
- As the user, I receive **alerts**: deadline reminders, new high-match leads, daily/weekly digest, a "needs action" list (logged locally first, email-ready).

### Configure
- As the user, I edit **my profile**, preferred project types, excluded categories, budget limits, **scoring weights**, sources, API keys and export preferences in Settings.

---

## 3. Technical Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Next.js (App Router, TS)                     │
│  UI (RSC + client islands) ── Tailwind + shadcn/ui                   │
│  ─ Dashboard · Opportunities · Detail · Sources · Import ·          │
│    Lists · Watchlist · Settings · Global tab                        │
├────────────────────────────────────────────────────────────────────┤
│                        Route Handlers (/api/*)                      │
│  opportunities · sources · lists · watchlist · import/community ·   │
│  ai · export · score · saved-searches · dashboard · cron/discover  │
├───────────────┬───────────────┬───────────────┬────────────────────┤
│  lib/ingestion│   lib/ai       │  lib/scoring   │   lib/export        │
│  rss · web ·  │ provider-      │ weighted 0–100 │  csv · xlsx · pdf · │
│  dedupe ·     │ agnostic       │ + explainable  │  md · notion        │
│  normalise    │ (OpenAI-compat)│ breakdown      │                     │
├───────────────┴───────────────┴───────────────┴────────────────────┤
│                 Prisma ORM  →  PostgreSQL                            │
├────────────────────────────────────────────────────────────────────┤
│        Background jobs: cron route + queue table (DB-backed)        │
│        (node-cron / Vercel Cron / manual trigger compatible)        │
└────────────────────────────────────────────────────────────────────┘
```

**Decisions**
- **Next.js 14 App Router + TypeScript** — RSC for data-heavy lists, client islands for filters/forms.
- **PostgreSQL + Prisma** — relational fit for opportunities ↔ sources ↔ lists ↔ activity.
- **Auth:** dev-simple, NextAuth-shaped. A single `User` row + a `getCurrentUser()` seam that today returns the seeded power user and tomorrow plugs into NextAuth/Clerk without touching call sites. Every tenant-scoped query already carries `ownerId`.
- **AI:** provider-agnostic `lib/ai/provider.ts` (OpenAI-compatible by default; swap base URL/key). All AI calls go through one typed gateway; **graceful mock fallback** when no key is set so the app runs offline.
- **Background jobs:** a `JobRun`/`DiscoveryRun` table + a single `/api/cron/discover` handler callable by node-cron, Vercel Cron, or a button. No external broker required for v1.
- **Compliance gating** lives in `lib/ingestion` (robots.txt check, allowlist of source types eligible for automation, per-host rate limiting) — automation literally cannot run on `MANUAL`/`FACEBOOK` sources.

---

## 4. Database Schema (Prisma overview)

Full schema in `prisma/schema.prisma`. Core models:

- **User** — profile, preferred project types, excluded categories, budget limits, scoring weights (JSON), export prefs, API keys (encrypted-at-rest placeholder). 1 user for now, multi-ready.
- **Source** — `url`, `type` (PUBLIC_WEB | RSS | PROCUREMENT | ACCELERATOR | NEWSLETTER | API | FACEBOOK_MANUAL | UPLOAD | MANUAL), `frequency`, `keywords[]`, `country`, `region`, `category`, `enabled`, `lastCheckedAt`, `robotsAllowed`, `notes`, `workspace` (DK | GLOBAL).
- **Opportunity** — `title`, `description`, `rawContent`, `budgetMin/Max`, `currency`, `deadline`, `postedAt`, `expiresAt`, `status`, `isActive`, `url`, `organization`, `location`, `country`, `region`, `category`, `applicationRoute` (DIRECT | APPLICATION | UNKNOWN), `matchScore`, `scoreBreakdown` (JSON), `aiSummary`, `extractedRequirements` (JSON), `dedupeHash`, `ingestMethod` (AUTOMATED | MANUAL | COMMUNITY), `workspace`, relations → Source, Contacts, Attachments, Tags, Notes, Activities, Drafts, ListItems, WatchlistItem.
- **Contact** — name, role, email, phone, org, linkedin.
- **Attachment** — label, url, kind.
- **Tag** + **OpportunityTag** (m:n).
- **Note** — body, pinned, author.
- **Activity** — typed timeline event (STATUS_CHANGE, NOTE, AI_DRAFT, EXPORT, REMINDER, …) + metadata JSON.
- **Draft** — kind (APPLICATION | PITCH | EMAIL | CHECKLIST | SUMMARY | COMPARISON), content, model, prompt snapshot.
- **List** + **ListItem** — custom lead lists (m:n to Opportunity).
- **WatchlistItem** — pinned watch with priority + reminderAt.
- **SavedSearch** — name + serialized filter JSON.
- **CommunityImport** — group, author, postDate, url, content, status, → produces an Opportunity.
- **DiscoveryRun / JobRun** — audit of crawl runs: source, started/finished, found/new/updated counts, status, log.
- **Alert** — type (DEADLINE | NEW_HIGH_MATCH | DIGEST | NEEDS_ACTION), payload, read, channel (LOCAL | EMAIL).
- **Setting** — singleton-ish key/value for scoring weights & app config (also mirrored on User).

Enums: `SourceType`, `Workspace`, `OpportunityStatus`, `ApplicationRoute`, `IngestMethod`, `DraftKind`, `ActivityType`, `AlertType`, `MonitorFrequency`.

---

## 5. API Routes (Route Handlers)

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/opportunities` | List (with filters/pagination) / create manually |
| GET/PATCH/DELETE | `/api/opportunities/[id]` | Read / update (status, notes, fields) / delete |
| POST | `/api/opportunities/[id]/notes` | Add note |
| POST | `/api/score` | (Re)score one or many opportunities |
| GET/POST | `/api/sources` | List / create source |
| GET/PATCH/DELETE | `/api/sources/[id]` | Manage a source |
| POST | `/api/cron/discover` | Run discovery for due/enabled public sources |
| POST | `/api/import/community` | Compliant community/Facebook paste import (+ AI extract) |
| GET/POST | `/api/lists` · `/api/lists/[id]` | Manage custom lists + items |
| GET/POST/DELETE | `/api/watchlist` | Manage watchlist items |
| GET/POST | `/api/saved-searches` | Manage saved searches |
| POST | `/api/ai` | Unified AI gateway: `{action, opportunityId?, payload}` → summary/extract/classify/explain/draft/pitch/email/checklist/compare/similar |
| POST | `/api/export` | `{format, filters|ids}` → file stream (csv/xlsx/pdf/md/notion) |
| GET | `/api/dashboard` | Aggregated dashboard metrics |
| GET/POST | `/api/alerts` | List/generate alerts & digest |
| GET/PATCH | `/api/settings` | Read/update profile, weights, prefs |

All mutating routes validate input with Zod (`lib/validators`), scope by `ownerId`, and write an `Activity` where relevant.

---

## 6. Crawler / Import Architecture (compliance-first)

Two **strictly separated** ingestion lanes:

### Lane A — Automated public-source discovery (`lib/ingestion`)
Eligible source types **only**: `PUBLIC_WEB`, `RSS`, `PROCUREMENT`, `ACCELERATOR`, `NEWSLETTER`, `API`.
Pipeline: `selectDueSources → fetch → parse → normalise → dedupe → score → persist → log run`.
- `rss.ts` — RSS/Atom via fetch + parser.
- `web.ts` — fetch-based fetch + cheerio-style extraction; **Playwright only** behind a flag for JS-rendered *public* pages.
- **Guards (hard):** `robots.txt` check + cache, per-host rate limiter, User-Agent identification, timeout, max-pages cap, allowlist of automatable types. If a host disallows or a type is non-automatable → **skip, never bypass.**
- `dedupe.ts` — stable `dedupeHash` from normalised `url` + title + org; upsert on conflict.
- Adapters are pluggable: each source can name a `parserKey` mapping to a site-specific extractor (EHSYS, Beyond Beta, Erhvervshuse, accelerator pages…). v1 ships a **generic extractor + clearly-marked TODO stubs** for site-specific selectors.

### Lane B — Manual / community import (`/api/import/community`)
For Facebook groups & communities — **never automated**.
- Manual paste (text + url + group + author + date + notes).
- Browser-side "save this post" concept (bookmarklet documented in COMPLIANCE.md) — user-assisted capture, not server scraping.
- Uploaded export / screenshot (OCR is a documented future hook).
- AI `extract` turns pasted text into a candidate `Opportunity` (flagged `ingestMethod = COMMUNITY`) the user confirms.

> **Hard rule encoded in code & docs:** no login bypass, no closed-group access, respect robots.txt / paywalls / rate limits / ToS. See `docs/COMPLIANCE.md`.

---

## 7. AI Processing Pipeline (`lib/ai`)

One typed gateway, provider-agnostic (OpenAI-compatible). Every action has a strict prompt
template (`prompts.ts`) and a JSON-validated output. **Mock fallback** returns deterministic
stub data when `LLM_API_KEY` is unset so the whole app runs without a key.

Actions:
1. `summarize` — concise opportunity summary.
2. `extract` — budget / deadline / contact / location / requirements from raw text.
3. `classify` — category + tags.
4. `explainScore` — natural-language *why this lead is relevant*.
5. `draftApplication` / `draftPitch` / `draftEmail` / `checklist` — generated artefacts saved as `Draft`.
6. `compare` — side-by-side of multiple opportunities.
7. `similar` — embedding/keyword similarity over stored leads (v1: keyword/cosine over TF-IDF-ish; embeddings are a documented upgrade).
8. `nextAction` — recommended next step.

Pipeline order on ingest: `extract → classify → score → summarize → explainScore` (each step optional/idempotent and re-runnable from the UI).

---

## 8. UI Pages / Components

**Pages**
- `/` **Dashboard** — new leads, active, upcoming deadlines, best matches, watchlist, applied, won/lost, pipeline value, leads by source, leads by category.
- `/opportunities` — power table + filter rail + card/table toggle + bulk actions + export.
- `/opportunities/[id]` — full detail with side-panel actions, AI tools, timeline, drafts.
- `/sources` — source CRUD, type badges, last-checked, run-now, enable/disable.
- `/import` — community/Facebook compliant import (paste → AI extract → confirm).
- `/lists` — custom lists management.
- `/watchlist` — pinned watch with priority + reminders.
- `/settings` — profile, project types, excluded categories, budget limits, scoring weights, sources, API keys, export prefs.
- `/global` — same engine, `workspace = GLOBAL` (mirrors dashboard/opportunities scoped to international).

**Key components** (shadcn-based): Sidebar, Topbar (+workspace switcher DK/Global), `ScoreBadge`, `StatusBadge`, `OpportunityTable`, `OpportunityCard`, `FilterRail`, `StatCard`, `DeadlinePill`, `PipelineBoard`, `AiActionPanel`, `ActivityTimeline`, `DraftViewer`, `ExportDialog`, `SourceForm`, `CommunityImportForm`, `ListPicker`, `TagInput`, `EmptyState`.

**Design language:** dark-first intelligence aesthetic, generous whitespace, mono accents for numbers/scores, color-coded status & score, fast keyboard-friendly tables, slide-over side panels for detail/actions.

---

## 9. Security / Compliance Considerations

- **Ingestion compliance** as above — robots/ToS/rate-limit/paywall respected; automation impossible on community sources; full audit trail in `DiscoveryRun`.
- **GDPR mindfulness:** stored contacts are business leads; provide delete/redact; document lawful basis; no special-category data; community imports are user-supplied.
- **Secrets:** API keys in `.env` (never committed); `.env.example` documents all; key fields in DB are placeholders marked for encryption-at-rest before prod.
- **Input validation:** Zod on every route; output encoding by React; parameterised queries via Prisma.
- **Auth seam:** `ownerId` scoping everywhere now; drop-in NextAuth later.
- **Rate limiting / abuse:** per-host limiter for crawlers; API route basic guard.

---

## 10. Development Milestones

- **M0 — Foundation** ✅ scope of this scaffold: repo, configs, Prisma schema, lib contracts, env, docker, README, design system, app shell.
- **M1 — Core CRUD:** Opportunities + Sources CRUD, list/detail UI, filters.
- **M2 — Triage:** scoring engine + weights settings, watchlist, lists, tags, status pipeline, saved searches.
- **M3 — Ingestion:** RSS + generic web discovery, dedupe, discovery runs, cron route; site-specific parser stubs.
- **M4 — Community import:** compliant paste → AI extract → confirm.
- **M5 — AI suite:** summarize/extract/classify/explain/draft/pitch/email/checklist/compare/similar with mock fallback.
- **M6 — Export:** CSV/XLSX/PDF/MD/Notion.
- **M7 — Alerts:** deadline reminders, high-match alerts, digest, needs-action (local log → email-ready).
- **M8 — Global tab + polish + tests + deploy.**

---

## 11. Testing Plan

- **Unit:** scoring (weights → 0–100, boundaries), dedupe hashing, export formatters, AI output validators, date/active-expiry logic, compliance gate (rejects FACEBOOK/MANUAL from automation).
- **Integration:** API route handlers against a test Postgres (or SQLite shadow) with Prisma; ingestion pipeline with fixture HTML/RSS.
- **E2E (Playwright):** add source → run discovery (fixture) → triage → save to list → export; community paste → extract → confirm.
- **Tooling:** Vitest for unit/integration, Playwright for E2E, `prisma migrate` in CI, typecheck + ESLint gates.

---

## 12. Deployment Plan

- **Local:** `docker compose up` (Postgres) → `pnpm prisma migrate dev` → `pnpm db:seed` → `pnpm dev`.
- **Container:** multi-stage `Dockerfile`; `docker-compose.yml` runs app + Postgres.
- **Cloud:** Vercel (app) + managed Postgres (Neon/Supabase/RDS); Vercel Cron hits `/api/cron/discover`. Alternatively a single VPS with the compose file + system cron.
- **Migrations:** Prisma migrate; seed optional. Secrets via platform env.
- **Observability:** discovery-run logs in DB + structured console logging; health route.

---

## 13. Future Roadmap

- Real site-specific parsers for EHSYS, Beyond Beta, Erhvervshuse, accelerator/funding DBs.
- Vector embeddings for true semantic similarity & "find similar".
- OCR for uploaded screenshots; email/newsletter inbound (forward-to-import address).
- Real email delivery (Resend/Postmark) for digests & reminders.
- Multi-user SaaS: NextAuth/Clerk, orgs, billing (deferred — single user first).
- Browser extension for the "save this post" capture flow.
- Mobile-friendly triage + push notifications.
- Auto-tuning scoring from won/lost outcomes (feedback loop).

---

## 14. Build Execution Strategy (how this scaffold is produced)

Foundation (schema, types, design tokens, lib contracts, app shell) is authored coherently
first, then independent leaf modules (page sets, API route groups, component groups) are
built by **parallel subagents**, each owning disjoint files and importing the shared
contracts. A final glue + seed + verification pass wires everything together. See
`docs/ARCHITECTURE.md` for the file map and `README.md` for setup.
