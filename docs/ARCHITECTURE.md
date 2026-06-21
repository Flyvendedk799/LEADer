# LEADer — Architecture & File Map

## Stack
Next.js 14 (App Router, TS) · Tailwind + shadcn/ui · PostgreSQL · Prisma · NextAuth-shaped
auth seam · Zod · provider-agnostic OpenAI-compatible AI layer · DB-backed jobs · fetch/RSS
(+ optional Playwright) crawlers for public sources only.

## Folder map
```
LEADer/
├─ docs/                      PLAN.md · ARCHITECTURE.md · COMPLIANCE.md · ROADMAP.md
├─ prisma/
│  ├─ schema.prisma           all models + enums (source of truth)
│  └─ seed.ts                 demo power-user, sources, opportunities, lists
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx           root shell (sidebar + topbar + workspace switcher)
│  │  ├─ globals.css          design tokens (dark intelligence theme)
│  │  ├─ page.tsx             Dashboard
│  │  ├─ opportunities/       list + [id] detail
│  │  ├─ sources/             source management
│  │  ├─ import/              compliant community/Facebook import
│  │  ├─ lists/ watchlist/    saved lists & watch
│  │  ├─ settings/            profile, weights, keys, prefs
│  │  ├─ global/              GLOBAL workspace view
│  │  └─ api/                 route handlers (see PLAN §5)
│  ├─ components/
│  │  ├─ ui/                  shadcn primitives
│  │  ├─ layout/              sidebar, topbar, workspace-switcher
│  │  ├─ opportunities/       table, card, filter-rail, badges, ai-panel, timeline, drafts
│  │  ├─ dashboard/           stat cards, charts
│  │  ├─ sources/ import/ lists/ settings/ shared/
│  ├─ lib/
│  │  ├─ db.ts                Prisma client singleton
│  │  ├─ auth.ts              getCurrentUser() seam (dev → NextAuth-ready)
│  │  ├─ ai/                  provider.ts · prompts.ts · index.ts (gateway + mock fallback)
│  │  ├─ scoring/             index.ts (0–100 explainable) · config.ts (default weights)
│  │  ├─ ingestion/           index.ts · rss.ts · web.ts · dedupe.ts · compliance.ts · parsers/
│  │  ├─ export/              csv.ts · xlsx.ts · pdf.ts · markdown.ts · notion.ts · fields.ts
│  │  ├─ validators/          zod schemas per resource
│  │  ├─ types.ts             shared TS types / DTOs
│  │  └─ utils.ts             cn(), dates, formatting, money
│  └─ hooks/                  client data hooks (filters, fetch)
├─ scripts/                   dev helpers (run-discovery, etc.)
├─ .env.example · .gitignore · package.json · tsconfig.json
├─ next.config.mjs · tailwind.config.ts · postcss.config.mjs · components.json
└─ docker-compose.yml · Dockerfile · README.md
```

## Shared contracts (every module depends on these)
- **`prisma/schema.prisma`** — the data model. All persisted shapes derive from here.
- **`src/lib/types.ts`** — `OpportunityFilter`, `ScoreWeights`, `ScoreBreakdown`, `AiAction`,
  `ExportFormat`, `ExportRow`, DTOs. Import from here; do not redefine.
- **`src/lib/scoring/config.ts`** — `DEFAULT_WEIGHTS` and weight keys.
- **`src/lib/export/fields.ts`** — the export field contract (Title, Source, URL, Budget,
  Deadline, Status, Match score, Summary, Notes, Tags, Next action).
- **Design tokens** in `globals.css` + `tailwind.config.ts` — use the semantic classes
  (`bg-surface`, `text-muted`, score/status color helpers), never hard-coded hex.

## Auth seam
`getCurrentUser()` returns the seeded power user today. Replace its body with a NextAuth/Clerk
session lookup later; all queries already filter by the returned `ownerId`.

## AI seam
All AI goes through `lib/ai/index.ts` -> `provider.ts`. User-level provider settings live in
`User.aiKeys` with encrypted API keys and masked client metadata; the gateway supports OpenAI-compatible
chat completions, Claude via Anthropic, Codex/ChatGPT subscription auth from the local Codex CLI,
and Claude Code subscription auth from macOS Keychain. With no user key, subscription login, or
`LLM_API_KEY`, a deterministic **mock** returns valid structured output so the app fully runs
offline. Swap `LLM_BASE_URL` to use any OpenAI-compatible endpoint.

## Jobs seam
`/api/cron/discover` runs due, enabled, automatable sources. Trigger via Vercel Cron, node-cron,
system cron, or the "Run now" button. Each run writes a `DiscoveryRun` audit row.
