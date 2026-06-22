import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { discoveryQueueSnapshot } from "@/lib/crm/discovery-queue";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const mission = await db.discoveryMission.findFirst({
      where: { id: params.id, ownerId },
      include: {
        lane: true,
        candidates: {
          orderBy: [{ pursuitScore: "desc" }, { createdAt: "desc" }],
          include: { evidence: true, deal: true, account: true },
        },
      },
    });
    if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ mission, queue: discoveryQueueSnapshot(ownerId) });
  } catch (err) {
    return apiError(err);
  }
}
