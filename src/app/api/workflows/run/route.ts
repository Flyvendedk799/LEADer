import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkflowRun } from "@/lib/workflows/playbooks";
import { enqueueWorkflowRun, recoverWorkflowQueue, workflowQueueSnapshot } from "@/lib/workflows/queue";
import { workflowRunInputSchema } from "@/lib/workflows/types";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const queue = await recoverWorkflowQueue(ownerId);
    const runs = await db.workflowRun.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ runs, queue });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json().catch(() => ({}));
    const parsed = workflowRunInputSchema.safeParse(json ?? {});

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const run = await createWorkflowRun(ownerId, parsed.data, "QUEUED");
    enqueueWorkflowRun(ownerId, run.id, parsed.data);
    return NextResponse.json({ run, queued: true, queue: workflowQueueSnapshot(ownerId) }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
