# LEADer API and MCP server

Everything the web app does goes through `/api/*` routes. Scripts and agents use
the same routes with a **personal API token**.

## Tokens

- Create one in **Settings → Security → API access**, or on the server:
  `npm run token:create -- --email you@example.com --name "Claude Code" [--days 365]`.
- Send it as `Authorization: Bearer ldr_…`. The raw token is shown once; only its
  SHA-256 is stored. Revoke it in Settings or with `DELETE /api/tokens?id=…`.
- A token acts as its owner on every route. Two account-level actions need a
  signed-in browser session instead: changing the password and creating tokens.
- An invalid, expired or revoked token returns 401; it never falls back to a
  cookie session.

```bash
export LEADER=https://leader.mast3kmedia.dk LEADER_TOKEN=ldr_…
curl -H "Authorization: Bearer $LEADER_TOKEN" $LEADER/api/ops/overview
```

## MCP server

`POST /api/mcp` is a stateless MCP server (Streamable HTTP, JSON responses).

```bash
claude mcp add --scope user --transport http leader https://leader.mast3kmedia.dk/api/mcp \
  --header "Authorization: Bearer $LEADER_TOKEN"
```

| Tool | Does |
|---|---|
| `leader_overview` | Worker, providers, usage vs allowances, counts, lanes, recent missions/workflows with log tails, source scans |
| `leader_list_candidates` / `leader_get_candidate` | Review queue with scores and reasons / full candidate with evidence |
| `leader_review_candidate` / `leader_bulk_candidates` | save (→ deal + task), dismiss, duplicate, review, snooze, restore, feedback, edit |
| `leader_list_lanes` / `leader_update_lane` / `leader_create_lane` | Inspect and tune discovery lanes |
| `leader_run_discovery` / `leader_list_runs` / `leader_get_run` / `leader_run_action` | Queue, inspect, cancel, rerun and reorder discovery missions |
| `leader_run_workflow` / `leader_list_workflow_runs` | Playbooks: daily-sweep, candidate-harvest, pipeline-rescue, operating-day, research-brief |
| `leader_get_settings` / `leader_update_settings` | Company profile (allowances, budgets), preferences, scoring weights; profile patches are merged |
| `leader_list_deals` / `leader_list_tasks` | Pipeline and follow-ups |
| `leader_api` | Any `/api/*` route below |

Tools call the app's own API over loopback (`http://127.0.0.1:$PORT`, or
`LEADER_INTERNAL_URL`) with the caller's token, so they have exactly the
validation and ownership checks of the web app.

## Operator endpoints

| Route | |
|---|---|
| `GET /api/ops/overview` | Everything needed to answer "is it healthy, what did it spend, what failed" |
| `GET /api/ops/candidates` | `status=NEW,REVIEWED`, `lane=<slug>`, `missionId`, `q`, `minScore`, `workspace`, `sort=score\|recent`, `limit` (≤200), `offset` |
| `GET /api/ops/candidates/:id` | Candidate with raw content, score breakdown, evidence, mission, lane, deal |
| `GET/PATCH /api/ops/lanes/:idOrSlug` | Read or patch name, description, active, queryTemplates, positive/negativeKeywords, evidenceRequirements, conversionGuidance, scoringConfig |
| `GET/POST/DELETE /api/tokens` | List, create (session only), revoke |

## Application routes

| Area | Routes |
|---|---|
| Discovery | `GET/POST/PATCH /api/discovery/runs`, `GET /api/discovery/runs/:id`, `GET/POST /api/discovery/lanes`, `PATCH /api/discovery/candidates/:id`, `POST /api/discovery/candidates/bulk`, `GET /api/discovery/evaluation` |
| Ad-hoc discover | `POST /api/discover/search`, `/save`, `/save-source`, `/feedback`, `/import` |
| CRM | `/api/deals` (+ `/:id`, `/:id/contacted`, `/workflow-actions`), `/api/accounts`, `/api/people`, `/api/touchpoints`, `/api/tasks`, `/api/conversion-assets` (+ `/:id/versions`) |
| Legacy pipeline | `/api/opportunities` (+ `/:id`, `/:id/notes`, `/:id/similar`, `/bulk`), `/api/lists`, `/api/watchlist`, `/api/saved-searches` |
| Sources | `/api/sources` (+ `/:id`, `/workflow-actions`) |
| Workflows | `GET/POST/PATCH /api/workflows/run`, `/api/workflows/presets` (+ `/:id`, `/:id/queue`, `/schedule-controls`), `POST /api/workflows/preview` |
| AI | `POST /api/ai` (drafts), `POST /api/agent` (in-app assistant), `/api/score`, `/api/calibration`, `/api/embeddings/backfill` |
| Settings and ops | `GET/PATCH /api/settings`, `GET/PATCH /api/usage`, `GET /api/operations`, `GET /api/dashboard`, `GET /api/nav/counts`, `/api/alerts` |
| Import / export | `POST /api/import/leads`, `/api/import/community`, `GET /api/export` |
| Health (public) | `GET /api/health`, `GET /api/health/worker` |
| Cron (`CRON_SECRET`) | `POST /api/cron/discover`, `/api/cron/alerts`, `/api/cron/workflows` |

Errors are JSON `{ "error": … }` with 400 (validation), 401, 403, 404, 409 or 500.
