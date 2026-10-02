# LEADer 🎯

**Personal lead-intelligence platform** — discover, track, evaluate, save and export
funded startup work, voucher assignments, grant-backed supplier tasks, tender-like
opportunities and community leads. **Denmark-first, with a separate Global workspace.**

Built for one power user (you) but on SaaS-ready foundations. Optimised for someone who
reviews opportunities every day: clean intelligence-dashboard UI, transparent match
scoring, compliant ingestion, AI assistance, and one-click exports.

> 📐 Full architecture & rationale: [`docs/PLAN.md`](docs/PLAN.md) ·
> [`docs/OUTCOME_LEARNING.md`](docs/OUTCOME_LEARNING.md) ·
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
> [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) ·
> [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## Daily workflow

1. **Today** shows your next tasks, review queue, deadlines and pipeline. Switch between Denmark and Global; values remain grouped by currency.
2. **Discover** explains the run, checks provider readiness and lets you choose a work lane, write a brief, set required/excluded terms, and choose sources. Runs keep their progress, warnings and history; they can be canceled or retried.
3. **Review leads** keeps discoveries outside your sales pipeline until you check their evidence. Source metadata distinguishes a page read from a search excerpt, a blocked source or an unread document. Match scores and AI summaries are aids to review, not verified facts.
4. **Add to deals** saves the account, deal, original evidence, extracted email contacts and a dated qualification task in one transaction. Repeated saves return the existing deal. Previously dismissed or saved discoveries do not become new review items on the next run.
5. **Deals** supports search, stages, attention filters, list/board views and editing. Each deal groups its brief, tasks, evidence, contacts, conversation history and saved drafts.
6. **Tasks** supports standalone reminders and deal follow-ups, including completion, reopening and rescheduling. **Accounts** keeps buyer context; **Automations** separates launching work, run history and items needing attention.

### Discovery connections and limits

Broad web discovery requires a Tavily, Brave Search or Serper key in **Settings → AI** (or the corresponding environment variable). Danish tender discovery can use the public udbud.dk index without a search key. Source scans use enabled public sources and curated Danish sources. AI planning and summaries require a configured model; without it, deterministic matching remains available and AI draft examples are labeled.

Only public, robots-allowed pages are fetched. Network requests have timeouts, redirect validation and size limits. Discovery caps page reads and source traversal. Search excerpts and PDF links remain explicitly unverified when full content cannot be read. Private conversations belong in **Community import** or a manually added deal. No outreach is sent when you save a lead.

Review source dates, buyer identity and extracted numbers before acting. Public sites and paid providers can fail or change their markup; run warnings and retained source URLs are there to make those failures inspectable.

---

## Tech stack

Next.js 15.5 (App Router, TS) · Tailwind + shadcn/ui · PostgreSQL · Prisma · Zod ·
provider-agnostic OpenAI-compatible AI layer · fetch/RSS (+ optional Playwright) crawlers
for **public sources only** · ExcelJS / pdf-lib for exports.

---

## Quick start (local)

> Prereqs: **Node ≥ 22.12** and PostgreSQL (use Docker or the bundled local server). Uses `npm` by default; `pnpm`/`yarn` work too.

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env          # defaults already match the Docker Postgres below

# 3. Start Postgres (choose one)
docker compose up -d db
# Or, without Docker, in a separate terminal:
npm run db:local

# 4. Apply migrations and seed demo data
npm run db:generate
npm run db:migrate:deploy
npm run db:seed

# 5. Run the app
npm run dev                   # http://localhost:3000
```

Then **sign in at http://localhost:3000/login** with the credentials the seed prints
(default `owner@leader.local` / `leader-demo-1234`), or register a new account at
`/register`. Prefer to skip login while hacking locally? Set `AUTH_DEV_BYPASS=true`
(ignored in production) to run as the seeded user.

The seed populates example accounts, deals and discovery lanes. CRM use needs no API keys.
AI draft actions show labeled example output (and local embeddings power similarity) until you
choose a local Codex/ChatGPT or Claude Code subscription provider, add an OpenAI/Claude
API key during onboarding or in **Settings → AI**, or set `LLM_API_KEY`.

`db:local` stores persistent data in `tmp/pg-data` and binds only to localhost. Keep it running while using the app. Back up that folder with PostgreSQL stopped, or use `pg_dump`; do not delete it during cleanup.

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

1. **AI** — each user picks their own provider in **Settings → AI**. There are three
   ways to pay for a call, all of them per-user:

   | | how it bills |
   |---|---|
   | **An API key** — OpenAI, or Claude on Anthropic's Messages API | the key's owner, metered |
   | **Your own Claude subscription**, connected from Settings | the person who connected it |
   | **A `claude` or `codex` login on the server** | whoever runs the server |

   The credential half of this is [`@flyvendedk799/ai-auth`](https://github.com/Flyvendedk799/ai-auth):
   the OAuth flow, the Claude Code identity block premium models refuse a
   subscription token without, the encryption at rest, and the model catalogue
   behind the picker. See [docs/AI_AUTH.md](docs/AI_AUTH.md) for what each piece
   does and the traps it is defending against.

   **Connecting a Claude subscription** (Settings → AI → *Claude Code subscription*):
   LEADer prints an approval URL, you approve it at Anthropic and paste the code
   back. The consent screen says *Claude Code*, because the flow uses that CLI's
   client id — tell your users, and read Anthropic's subscription terms before
   pointing a hosted deployment at consumer plans. Nothing but the code crosses
   the browser; the credential is sealed (AES-256-GCM) into `AiCredential`.

   Leave it unconnected and a `claude-subscription` call falls back to the login
   on the machine LEADer runs on — the macOS Keychain or `~/.claude/.credentials.json`
   — which is what a self-hosted single-user instance usually wants.

   Set a stable `AI_KEYS_ENCRYPTION_SECRET` in production. Rotating it makes stored
   keys and connections unreadable — they read as "not configured" and are
   re-entered, rather than failing a boot.

   `.env` still works as a server-wide fallback for users who have saved nothing:
   ```
   AI_KEYS_ENCRYPTION_SECRET="use-a-long-random-secret"
   LLM_PROVIDER="openai"                    # openai | anthropic | codex | claude-subscription
   LLM_API_KEY="sk-..."                     # any OpenAI-compatible key
   LLM_BASE_URL="https://api.openai.com/v1" # or Azure / local / OpenRouter…
   LLM_MODEL="gpt-4o-mini"
   ```
   For `LLM_PROVIDER=codex`, stay signed in to the Codex CLI (`~/.codex/auth.json`).
   LEADer never refreshes that token: the CLI keeps its own current, and the answer
   to an expired one is to run `codex` once. The AI gateway (`src/lib/ai`) switches
   from mock to live automatically.

2. **Real sources** — in **Settings → Sources**, point sources at real **public** URLs/feeds.
   For structured sites, implement a site-specific parser in
   [`src/lib/ingestion/parsers/index.ts`](src/lib/ingestion/parsers/index.ts) (stubs +
   instructions included for EHSYS, Beyond Beta, Erhvervshuse, accelerators, procurement)
   and set the source's `parserKey`.

3. **On-demand discovery search** — add one search provider key to make **Discover** search
   the broader web instead of only scanning saved sources:
   ```
   TAVILY_API_KEY="tvly-..."          # preferred for AI-agent style search
   BRAVE_SEARCH_API_KEY="..."         # Brave's independent web index
   SERPER_API_KEY="..."               # Google SERP results via Serper
   ```
   The Discover page combines provider results with saved-source scans, then dedupes,
   extracts budget/deadline/contact signals, scores candidates and saves selected leads as
   automated discoveries.

4. **Scheduled discovery** — `POST /api/cron/discover` runs due automatable sources for every
   owner (frequency-aware). Wire it to Vercel Cron, a system cron, or `npm run discover`.
   Protect it with `CRON_SECRET` (sent as the `x-cron-secret` header).

5. **Email alerts** — set `EMAIL_PROVIDER=resend` + `EMAIL_API_KEY` + `EMAIL_FROM` to deliver
   digests & deadline reminders for real (use `console` to print them in dev). With no provider
   set, alerts stay in-app (`Alert` rows, surfaced by the topbar bell). Schedule
   `POST /api/cron/alerts` (also `CRON_SECRET`-guarded) for daily reminders/digests.

6. **Semantic search** — "find similar" uses embeddings. With `LLM_API_KEY` set it calls the
   configured `/embeddings` endpoint; offline it uses a deterministic local vector. Run
   `npm run embeddings:backfill` after importing data, or rely on auto-embedding at create time.

7. **Auth** — accounts are real out of the box (scrypt + server-side sessions). For SSO/OAuth,
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
