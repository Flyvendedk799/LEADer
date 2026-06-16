# LEADer — Roadmap

## Shipped
- ✅ Architecture + plan + compliance docs
- ✅ Next.js + TS + Tailwind + shadcn + Prisma foundation
- ✅ Full data model (opportunities, sources, lists, watchlist, drafts, activity, alerts, **sessions**…)
- ✅ Scoring engine (explainable 0–100, customizable weights)
- ✅ Provider-agnostic AI gateway with offline mock fallback
- ✅ Compliance-gated ingestion architecture (RSS + generic web; community import lane)
- ✅ Exports (CSV / XLSX / PDF / Markdown / Notion)
- ✅ Dashboard, opportunities, detail, sources, import, lists, watchlist, settings, global tab
- ✅ Seed/demo data + README
- ✅ **Real multi-user auth** — scrypt password hashing, opaque server-side sessions,
  login/register/logout, password change, middleware route-gating, per-user isolation.
- ✅ **Structured-data + site parsers** — JSON-LD + microdata extraction and config-driven
  site card parsers (replaces the old `[]` stubs); generic crawler prefers structured data.
- ✅ **Embeddings-backed "find similar"** — provider `/embeddings` with a deterministic
  offline fallback; cosine ranking + keyword fallback; auto-embed on create + backfill.
- ✅ **Real email delivery + alerts** — Resend integration (console provider for dev),
  digest & deadline-reminder templates, an in-app alerts inbox (topbar bell), and
  multi-tenant cron endpoints (`/api/cron/discover`, `/api/cron/alerts`).
- ✅ **CI** — GitHub Actions: lint · typecheck · unit tests · build · Playwright E2E
  (Postgres service + seed).

## Next (highest leverage)
1. **OAuth / SSO** (Google, GitHub) layered onto the existing auth seam.
2. **Real LLM wiring** in CI/staging — validate prompt outputs against fixtures.
3. **More site parsers** — tune CSS configs against live EHSYS / Beyond Beta / Erhvervshuse
   markup as sources are onboarded (structured-data path already covers many).
4. **Outcome feedback loop** — auto-tune scoring weights from Won/Lost history.

## Later
- OCR for uploaded screenshots; forward-to-import email address.
- Browser extension for the compliant "save this post" capture flow.
- Multi-user orgs / teams + roles beyond OWNER/MEMBER.
- Mobile triage + push notifications.
- Optional billing (only if it ever becomes multi-tenant SaaS).
