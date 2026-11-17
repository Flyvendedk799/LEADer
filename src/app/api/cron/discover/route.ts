import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkflowRun } from "@/lib/workflows/playbooks";
import { apiError, validCronSecret } from "@/lib/api";
import { assertAutomatable } from "@/lib/ingestion/compliance";
export async function POST(req: Request) {
  try {
    const { sourceId } = z.object({ sourceId: z.string().optional() }).parse(await req.json().catch(() => ({})));
    const user = await getCurrentUser();
    if (!user && !validCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (sourceId && !user) return NextResponse.json({ error: "Authentication required for a source scan" }, { status: 401 });
    let workspace: "DK" | "GLOBAL" = "DK";
    if (sourceId) {
      const source = await db.source.findFirst({ where: { id: sourceId, ownerId: user!.id } });
      if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
      assertAutomatable(source.type); workspace = source.workspace;
    }
    const owners = user ? [user] : await db.user.findMany({ select: { id: true } });
    const runs = [];
    for (const owner of owners) runs.push(await createWorkflowRun(owner.id, { playbook: "daily-sweep", workspace, options: { dailySweep: { sourceId, includeSources: true, includeAlerts: false } } }));
    return NextResponse.json({ ran: "queued", runs: runs.map(r => ({ id: r.id, status: r.status })), results: [{ status: "QUEUED", found: 0, created: 0, updated: 0 }] }, { status: 202 });
  } catch (error) { return apiError(error); }
}
