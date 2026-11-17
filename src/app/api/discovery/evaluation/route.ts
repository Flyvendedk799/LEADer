import { NextResponse } from "next/server";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const missions = await db.discoveryMission.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, checkpoint: true, createdAt: true, lane: { select: { slug: true } } } });
    const records = missions.flatMap(mission => {
      const checkpoint = mission.checkpoint as { result?: { candidates?: Array<Record<string, unknown>> } } | null;
      return (checkpoint?.result?.candidates ?? []).map((candidate, i) => ({ id: `${mission.id}:${i}`, lane: mission.lane.slug, capturedAt: mission.createdAt.toISOString(), candidate, expected: null, rationale: "", reviewedBy: "" }));
    });
    return new NextResponse(JSON.stringify({ description: "Label expected true for useful company work and false for noise. This measures qualification on retrieved candidates, not recall across the entire web.", records }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="discovery-evaluation.json"' } });
  } catch (error) { return apiError(error); }
}
