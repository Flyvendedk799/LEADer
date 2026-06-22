import { NextResponse } from "next/server";
import type { WorkflowRun } from "@prisma/client";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkflowRun } from "@/lib/workflows/playbooks";
import { enqueueWorkflowRun, workflowQueueSnapshot } from "@/lib/workflows/queue";
import { workflowRunResultSummary } from "@/lib/workflows/result-summary";
import { presetToWorkflowInput } from "@/lib/workflows/presets";

function workflowRunPayload(run: WorkflowRun | null) {
  if (!run) return null;
  return {
    ...run,
    summary: workflowRunResultSummary(run.playbook, run.result),
  };
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const preset = await db.workflowPreset.findFirst({ where: { id: params.id, ownerId } });
    if (!preset) return NextResponse.json({ error: "Workflow preset not found" }, { status: 404 });

    const input = presetToWorkflowInput(preset);
    const run = await createWorkflowRun(ownerId, input, "QUEUED");
    await db.workflowPreset.update({ where: { id: preset.id }, data: { lastQueuedAt: new Date() } });
    enqueueWorkflowRun(ownerId, run.id, input);

    return NextResponse.json(
      { run: workflowRunPayload(run), queued: true, queue: workflowQueueSnapshot(ownerId) },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err);
  }
}
