import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueWorkflowPresetRun } from "@/lib/workflows/preset-runs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const preset = await db.workflowPreset.findFirst({ where: { id: params.id, ownerId } });
    if (!preset) return NextResponse.json({ error: "Workflow preset not found" }, { status: 404 });

    const queued = await queueWorkflowPresetRun(ownerId, preset);
    return NextResponse.json(queued, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
