// Cron entrypoint for automated discovery.
//
// This is the single trigger for running the discovery pipeline. It is designed
// to be invoked by:
//   - Vercel Cron (scheduled POST)
//   - an external scheduler / node-cron
//   - the in-app "Run now" button on the Sources page (POST { sourceId })
//
// Only AUTOMATABLE source types are ever processed — the compliance gate lives
// in lib/ingestion (assertAutomatable / runDueDiscovery skip list), so
// community/manual sources (Facebook, uploads, manual entry) are never fetched
// here. Those go through the manual Community Import lane instead.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDiscoveryForSource, runDueDiscovery } from "@/lib/ingestion";

const bodySchema = z.object({ sourceId: z.string().optional() });

export async function POST(req: Request) {
  try {
    // Optional shared-secret guard — only enforced when CRON_SECRET is configured.
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided = req.headers.get("x-cron-secret") ?? "";
      const a = Buffer.from(provided);
      const b = Buffer.from(secret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Always resolve the owner — scoping is required even for single-source runs.
    const ownerId = await requireOwnerId();

    // Body is optional (Vercel Cron sends none); tolerate empty/invalid JSON.
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json ?? {});
    const sourceId = parsed.success ? parsed.data.sourceId : undefined;

    if (sourceId) {
      // Only AUTOMATABLE source types are ever processed — the compliance gate
      // lives in lib/ingestion (assertAutomatable / runDueDiscovery skip list).
      const source = await db.source.findFirst({ where: { id: sourceId, ownerId } });
      if (!source) {
        return NextResponse.json({ error: "Source not found" }, { status: 404 });
      }
      const result = await runDiscoveryForSource(sourceId);
      return NextResponse.json({ ran: "single", results: [result] });
    }

    const results = await runDueDiscovery(ownerId);
    return NextResponse.json({ ran: "due", results });
  } catch {
    return NextResponse.json({ error: "Discovery run failed" }, { status: 500 });
  }
}
