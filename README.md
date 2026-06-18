# LEADer 🎯

**Personal lead-intelligence platform** — discover, track, evaluate, save and export
funded startup work, voucher assignments, grant-backed supplier tasks, tender-like
opportunities and community leads. **Denmark-first, with a separate Global workspace.**

Built for one power user (you) but on SaaS-ready foundations. Optimised for someone who
reviews opportunities every day: clean intelligence-dashboard UI, transparent match
scoring, compliant ingestion, AI assistance, and one-click exports.

> 📐 Full architecture & rationale: [`docs/PLAN.md`](docs/PLAN.md) ·
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
> [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) ·
> [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## What it does

| Module | What you get |
|---|---|
| **Source Management** | Add public websites, RSS, procurement portals, accelerator pages, newsletters, APIs, or community/manual sources. Keywords, region, category, frequency, enable/disable, last-checked. |
| **Discovery engine** | Compliant fetch of **public** pages/RSS → parse → extract budget/deadline/contact → dedupe → score → store. Site-specific parser stubs for EHSYS / Beyond Beta / Erhvervshuse. |
| **Community import** | Compliant, **manual-only** Facebook/community import (paste text+URL → AI extract → confirm). Never scrapes closed groups. |
| **Lead scoring** | Explainable **0–100** match score with a per-criterion breakdown, fully **customisable weights** in Settings. |
| **Watchlists & lists** | Watchlist, custom lists, tags, saved searches, status pipeline, priorities, reminders. |
| **Pipeline board** | Kanban view of your pipeline — drag opportunities between status columns to update them (optimistic, owner-scoped). DK/Global workspace toggle. |
| **Bulk actions** | Multi-select opportunities, then set status/priority, add to watchlist, add to a list, export, or delete — all in one batch (owner-scoped server-side). |
| **Command palette** | `⌘K` / `Ctrl+K` opens a global palette: live opportunity search, jump to any page, create a new opportunity, toggle theme — keyboard-first. |
| **Opportunity detail** | Summary, requirements, contacts, attachments, notes, activity timeline, saved AI drafts, related opportunities. |
| **Search & filtering** | Keyword, budget min/max, deadline range, active-only, source, category, score, status, tags, region, has-budget, application route — plus sortable table columns (title/budget/deadline/score). |
| **AI suite** | Summarise · extract · classify · explain match · draft application/pitch/email/checklist · compare · **find similar (embeddings)** · next action. Provider-agnostic, **runs offline with mock output + local embeddings**. |
| **Dashboard** | New/active leads, upcoming deadlines, best matches, watchlist, applied, won/lost, pipeline value, leads by source/category/status. |
| **Exporting** | CSV · XLSX · PDF report · Markdown · Notion-ready — fixed field contract. |
| **Alerts** | In-app alerts inbox (bell + unread badge), deadline reminders, new high-match alerts, digests — **delivered by email** when a provider is configured. |
| **Auth** | Real multi-user accounts: register/login, scrypt-hashed passwords, opaque server-side sessions, route-gating middleware, per-user data isolation. |
| **Settings** | Profile, preferred project types, excluded categories, budget limits, scoring weights, sources, API config, export preferences, **password / security**. |

---

## Tech stack

Next.js 14 (App Router, TS) · Tailwind + shadcn/ui · PostgreSQL · Prisma · Zod ·
provider-agnostic OpenAI-compatible AI layer · fetch/RSS (+ optional Playwright) crawlers
for **public sources only** · ExcelJS / pdf-lib for exports.

---

## Quick start (local)

> Prereqs: **Node ≥ 18.18** and **Docker** (for Postgres). Uses `npm` by default; `pnpm`/`yarn` work too.

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env          # defaults already match the Docker Postgres below

# 3. Start Postgres
docker compose up -d db

# 4. Create schema + generate client + seed demo data
npm run setup                 # = prisma generate && prisma db push && db:seed

# 5. Run the app
npm run dev                   # http://localhost:3000
```

Then **sign in at http://localhost:3000/login** with the credentials the seed prints
(default `owner@leader.local` / `leader-demo-1234`), or register a new account at
`/register`. Prefer to skip login while hacking locally? Set `AUTH_DEV_BYPASS=true`
(ignored in production) to run as the seeded user.

That's it — the dashboard, opportunities, sources, lists, watchlist, import and settings
pages are all populated by the seed. **No API keys needed**: the AI layer returns
deterministic mock output (and a local embedding model powers "find similar") until you
add an OpenAI or Claude key during onboarding, in **Settings → AI**, or via `LLM_API_KEY`.

### Useful scripts
```bash
npm run dev          # dev server
npm run build        # production build
npm run db:studio          # Prisma Studio (browse the DB)
npm run db:seed            # re-seed demo data (idempotent)
npm run discover           # run the discovery pipeline manually (see note below)
npm run embeddings:backfill # embed any opportunities missing a vector
npm run typecheck          # tsc --noEmit
npm run lint               # next lint
npm run test               # vitest unit tests
npm run test:e2e           # Playwright E2E (after `npx playwright install`)
```

### Run everything in containers
```bash
docker compose --profile full up --build   # app + Postgres
```

---

## Going live (real data + AI)

1. **AI** — each user can add or change their provider in **Settings → AI**. Supported
   chat providers are OpenAI-compatible chat completions and Claude via Anthropic's
   Messages API. User-entered keys are encrypted before storage; set a stable
   `AI_KEYS_ENCRYPTION_SECRET` in production so saved keys remain decryptable across
   deploys.

   `.env` still works as a server-wide fallback:
   ```
   AI_KEYS_ENCRYPTION_SECRET="use-a-long-random-secret"
   LLM_API_KEY="sk-..."                     # any OpenAI-compatible key
   LLM_BASE_URL="https://api.openai.com/v1" # or Azure / local / OpenRouter…
   LLM_MODEL="gpt-4o-mini"
   ```
   The AI gateway (`src/lib/ai`) switches from mock to live automatically.

2. **Real sources** — in **Settings → Sources**, point sources at real **public** URLs/feeds.
   For structured sites, implement a site-specific parser in
   [`src/lib/ingestion/parsers/index.ts`](src/lib/ingestion/parsers/index.ts) (stubs +
   instructions included for EHSYS, Beyond Beta, Erhvervshuse, accelerators, procurement)
   and set the source's `parserKey`.

3. **Scheduled discovery** — `POST /api/cron/discover` runs due automatable sources for every
   owner (frequency-aware). Wire it to Vercel Cron, a system cron, or `npm run discover`.
   Protect it with `CRON_SECRET` (sent as the `x-cron-secret` header).

4. **Email alerts** — set `EMAIL_PROVIDER=resend` + `EMAIL_API_KEY` + `EMAIL_FROM` to deliver
   digests & deadline reminders for real (use `console` to print them in dev). With no provider
   set, alerts stay in-app (`Alert` rows, surfaced by the topbar bell). Schedule
   `POST /api/cron/alerts` (also `CRON_SECRET`-guarded) for daily reminders/digests.

5. **Semantic search** — "find similar" uses embeddings. With `LLM_API_KEY` set it calls the
   configured `/embeddings` endpoint; offline it uses a deterministic local vector. Run
   `npm run embeddings:backfill` after importing data, or rely on auto-embedding at create time.

6. **Auth** — accounts are real out of the box (scrypt + server-side sessions). For SSO/OAuth,
   swap the body of `register`/`login` in `src/lib/auth` — every query already scopes by `ownerId`.

---

## ⚖️ Compliance (read this)

LEADer keeps **two strictly separated ingestion lanes** — see [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md):

- **Automated public-source discovery** — public pages/RSS only. Honours `robots.txt`,
  rate limits and timeouts; identifies its User-Agent; **never** logs in or bypasses
  paywalls/access controls. Community/manual source types are *structurally excluded* from
  automation in code (`assertAutomatable`).
- **Manual / community import** — for Facebook groups & communities the **human is the
  collector**: manual paste, user-assisted "save this post", or uploaded exports. LEADer's
  server never touches a closed group.

No closed-group scraping. No login bypass. Ever.

---

## Project structure

```
src/
  app/          pages (dashboard, opportunities, sources, import, lists, watchlist, settings, global) + /api routes
  components/   ui/ (shadcn) · layout/ · opportunities/ · dashboard/ · sources/ · import/ · lists/ · settings/ · shared/
  lib/          db · auth · types · scoring · ai · export · ingestion · validators · opportunities · display · utils
prisma/         schema.prisma · seed.ts
docs/           PLAN · ARCHITECTURE · COMPLIANCE · ROADMAP
scripts/        run-discovery.ts
```

Auth is **real and multi-user** (`src/lib/auth/`): scrypt password hashing, opaque
server-side sessions (token hashed at rest), `getCurrentUser()` resolved from the session
cookie, and a middleware gate. Every query scopes by `ownerId`, so adding SSO/OAuth later is
a localised change to `register`/`login`.

---

## Status & roadmap

A working daily-use tool, not a demo. Real multi-user auth, structured-data + site parsers,
embeddings-backed similarity, email delivery, an alerts inbox, multi-tenant scheduled
discovery, and CI (lint · typecheck · unit · build · E2E) are all in place. Remaining
nice-to-haves (OAuth/SSO, OCR for screenshots, browser-extension capture, auto-tuned scoring
weights) are tracked in [`docs/ROADMAP.md`](docs/ROADMAP.md).
