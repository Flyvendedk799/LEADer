import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { ensureDefaultDiscoveryLanes } from "@/lib/crm/lanes";
import { persistCandidate } from "@/lib/crm";
import { pastedLeadToCandidate } from "@/lib/discovery/paste-import";
const row = z.object({ title: z.string().trim().min(2).max(250), organization: z.string().max(200).optional(), description: z.string().max(10000).optional(), url: z.union([z.literal(""), z.string().url().refine(v => /^https?:/.test(v))]).optional() });
const schema = z.object({ workspace: z.enum(["DK", "GLOBAL"]).default("DK"), rows: z.array(row).min(1).max(200) });
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = schema.parse(await req.json());
    await ensureDefaultDiscoveryLanes(ownerId);
    const lane = await db.discoveryLane.findUniqueOrThrow({ where: { ownerId_slug: { ownerId, slug: "community-manual" } } });
    const ids: string[] = [];
    for (const [index, lead] of body.rows.entries()) {
      const candidate = pastedLeadToCandidate(lead, index, { workspace: body.workspace, label: "User import" });
      candidate.provenance = { status: "snippet", retrievedAt: new Date().toISOString(), reason: "User-supplied content; linked page has not been read" };
      const saved = await persistCandidate(ownerId, null, lane, candidate, body.workspace);
      ids.push(saved.id);
    }
    return NextResponse.json({ ids: [...new Set(ids)], count: new Set(ids).size });
  } catch (error) { return apiError(error); }
}
