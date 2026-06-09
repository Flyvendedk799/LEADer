# LEADer — Roadmap

## Now (this scaffold)
- ✅ Architecture + plan + compliance docs
- ✅ Next.js + TS + Tailwind + shadcn + Prisma foundation
- ✅ Full data model (opportunities, sources, lists, watchlist, drafts, activity, alerts…)
- ✅ Scoring engine (explainable 0–100, customizable weights)
- ✅ Provider-agnostic AI gateway with offline mock fallback
- ✅ Compliance-gated ingestion architecture (RSS + generic web; community import lane)
- ✅ Exports (CSV / XLSX / PDF / Markdown / Notion)
- ✅ Dashboard, opportunities, detail, sources, import, lists, watchlist, settings, global tab
- ✅ Seed/demo data + README

## Next (highest leverage)
1. **Site-specific parsers** for EHSYS, Beyond Beta, Erhvervshuse, accelerator/funding DBs (replace generic-extractor TODO stubs in `lib/ingestion/parsers`).
2. **Real LLM wiring** — set `LLM_API_KEY`; validate prompt outputs against fixtures.
3. **Embeddings** for true semantic "find similar" (swap keyword similarity).
4. **Real email** (Resend/Postmark) for digests & deadline reminders.
5. **Cron in prod** — Vercel Cron / system cron → `/api/cron/discover`.

## Later
- OCR for uploaded screenshots; forward-to-import email address.
- Browser extension for the compliant "save this post" capture flow.
- Auth (NextAuth/Clerk), multi-user orgs — drop into the existing `getCurrentUser()` seam.
- Outcome feedback loop: auto-tune scoring weights from Won/Lost history.
- Mobile triage + push notifications.
- Optional billing (only if it ever becomes multi-tenant SaaS).
