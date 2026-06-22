import { NextResponse } from "next/server";
import type { WorkflowRun } from "@prisma/client";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkflowRun } from "@/lib/workflows/playbooks";
import { workflowLogEntry, workflowQueueLogMessage } from "@/lib/workflows/logging";
import {
  enqueueWorkflowRun,
  isActiveWorkflowRun,
  recoverWorkflowQueue,
  removeQueuedWorkflowRun,
  reorderQueuedWorkflowRun,
  workflowQueueSnapshot,
  type WorkflowQueueMoveAction,
} from "@/lib/workflows/queue";
import { workflowRunResultSummary } from "@/lib/workflows/result-summary";
import { workflowRunInputSchema } from "@/lib/workflows/types";

type WorkflowRunPayload = WorkflowRun & {
  preset?: {
    name: string;
  } | null;
};

const workflowRunActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["CANCEL", "RERUN", "MOVE_UP", "MOVE_DOWN", "MOVE_TOP"]),
});

function workflowRunPayload(run: WorkflowRunPayload | null) {
  if (!run) return null;
  return {
    ...run,
    presetName: run.preset?.name ?? null,
    summary: workflowRunResultSummary(run.playbook, run.result),
  };
}

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const queue = await recoverWorkflowQueue(ownerId);
    const runs = await db.workflowRun.findMany({
      where: { ownerId },
      include: { preset: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ runs: runs.map(workflowRunPayload), queue });
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
    const queue = workflowQueueSnapshot(ownerId);
    const queueLog = workflowLogEntry(workflowQueueLogMessage(run.id, queue));
    await db.workflowRun.update({
      where: { id: run.id },
      data: { log: { push: queueLog } },
    }).catch(() => {});
    return NextResponse.json(
      { run: workflowRunPayload({ ...run, log: [...run.log, queueLog] }), queued: true, queue },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json().catch(() => ({}));
    const parsed = workflowRunActionSchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await recoverWorkflowQueue(ownerId);
    const source = await db.workflowRun.findFirst({ where: { id: parsed.data.id, ownerId } });
    if (!source) return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });

    if (parsed.data.action.startsWith("MOVE_")) {
      if (source.status !== "QUEUED" || isActiveWorkflowRun(ownerId, source.id)) {
        return NextResponse.json({ error: "Only waiting queued workflow runs can be moved" }, { status: 409 });
      }

      const moved = await reorderQueuedWorkflowRun(ownerId, source.id, parsed.data.action as WorkflowQueueMoveAction);
      if (moved.reason === "not_queued") {
        return NextResponse.json({ error: "Workflow run is not waiting in the queue" }, { status: 409 });
      }

      const run = await db.workflowRun.findFirst({
        where: { id: source.id, ownerId },
        include: { preset: { select: { name: true } } },
      });
      return NextResponse.json({ run: workflowRunPayload(run), queue: moved.queue, moved: moved.moved, reason: moved.reason });
    }

    if (parsed.data.action === "CANCEL") {
      if (!["QUEUED", "RUNNING"].includes(source.status)) {
        return NextResponse.json({ error: "Only queued or running workflow runs can be canceled" }, { status: 409 });
      }
      const removed = removeQueuedWorkflowRun(ownerId, source.id);
      const active = isActiveWorkflowRun(ownerId, source.id);
      const run = await db.workflowRun.update({
        where: { id: source.id },
        include: { preset: { select: { name: true } } },
        data: {
          status: "CANCELED",
          finishedAt: new Date(),
          log: {
            push: workflowLogEntry(
              active && !removed
                ? "Cancel requested while worker was running; preserving canceled status when the current step returns."
                : "Canceled before worker started.",
            ),
          },
        },
      });
      return NextResponse.json({ run: workflowRunPayload(run), queue: workflowQueueSnapshot(ownerId) });
    }

    const input = workflowRunInputSchema.safeParse(source.input ?? {
      playbook: source.playbook,
      workspace: source.workspace,
    });
    if (!input.success) {
      return NextResponse.json({ error: "Workflow run input is missing or invalid" }, { status: 400 });
    }

    const preset = source.presetId
      ? await db.workflowPreset.findFirst({ where: { id: source.presetId, ownerId }, select: { name: true } })
      : null;
    const run = await createWorkflowRun(ownerId, input.data, "QUEUED", {
      trigger: "rerun",
      presetId: source.presetId,
      presetName: preset?.name ?? null,
    });
    await db.workflowRun.update({
      where: { id: run.id },
      data: { log: { push: workflowLogEntry(`Rerun requested from ${source.id}.`) } },
    });
    enqueueWorkflowRun(ownerId, run.id, input.data);
    const queue = workflowQueueSnapshot(ownerId);
    const queueLog = workflowLogEntry(workflowQueueLogMessage(run.id, queue));
    await db.workflowRun.update({
      where: { id: run.id },
      data: { log: { push: queueLog } },
    }).catch(() => {});
    const queued = await db.workflowRun.findUnique({
      where: { id: run.id },
      include: { preset: { select: { name: true } } },
    });
    return NextResponse.json(
      { run: workflowRunPayload(queued ?? { ...run, log: [...run.log, queueLog] }), queued: true, queue },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err);
  }
}
