// Cron entrypoint for automated discovery.
//
// Triggers:
//   - Scheduler (Vercel Cron / system cron) → POST with x-cron-secret, no session.
//     Runs DUE discovery for every owner.
//   - In-app "Run now" (authenticated) → POST { sourceId } scoped to the user, or
//     POST {} to run the signed-in user's due sources.
//
// Only AUTOMATABLE source types are ever processed — the compliance gate lives in
// lib/ingestion (assertAutomatable / AUTOMATABLE skip list), so community/manual
// sources (Facebook, uploads, manual entry) are never fetched here.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDiscoveryForSource, runDueDiscovery, runDueDiscoveryAllOwners } from "@/lib/ingestion";
import { apiError } from "@/lib/api";

const bodySchema = z.object({ sourceId: z.string().optional() });

function validCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json ?? {});
    const sourceId = parsed.success ? parsed.data.sourceId : undefined;

    const user = await getCurrentUser();

    // Single-source run is always user-scoped and requires authentication.
    if (sourceId) {
      if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      const source = await db.source.findFirst({ where: { id: sourceId, ownerId: user.id } });
      if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
      const result = await runDiscoveryForSource(sourceId);
      return NextResponse.json({ ran: "single", results: [result] });
    }

    // Authenticated user → run their due sources.
    if (user) {
      const results = await runDueDiscovery(user.id);
      return NextResponse.json({ ran: "due", scope: "owner", results });
    }

    // Otherwise this must be the scheduler with a valid shared secret.
    if (!validCronSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const byOwner = await runDueDiscoveryAllOwners();
    return NextResponse.json({ ran: "due", scope: "all", byOwner });
  } catch (err) {
    return apiError(err);
  }
}
