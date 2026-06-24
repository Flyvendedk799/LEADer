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
  visibleWorkflowQueueSnapshotForOwner,
  workflowQueueSnapshot,
  type WorkflowQueueMoveAction,
} from "@/lib/workflows/queue";
import { ACTIVE_WORKFLOW_RUN_STATUSES } from "@/lib/workflows/preset-runs";
import { workflowRunInputMatchesActiveRun, workflowRunRerunBlockedMessage } from "@/lib/workflows/run-actions";
import { findActiveResearchBriefRun, researchBriefIdentityFromInput } from "@/lib/workflows/research-targets";
import { workflowRunResultSummary } from "@/lib/workflows/result-summary";
import { workflowRunInputSchema } from "@/lib/workflows/types";

type WorkflowRunPayload = WorkflowRun & {
  preset?: {
    name: string;
  } | null;
};

const workflowRunActionSchema = z.object({
  id: z.string().min(1).optional(),
  action: z.enum(["CANCEL", "CANCEL_ALL", "RERUN", "MOVE_UP", "MOVE_DOWN", "MOVE_TOP"]),
  limit: z.coerce.number().int().min(20).max(100).optional(),
});

function workflowRunHistoryLimit(req: Request) {
  const raw = new URL(req.url).searchParams.get("limit");
  const parsed = raw ? Number(raw) : 20;
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(100, Math.max(20, Math.floor(parsed)));
}

function workflowRunHistorySearch(req: Request) {
  return (new URL(req.url).searchParams.get("q") || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function safeJsonSearchText(value: unknown) {
  if (value == null) return "";
  try {
    return JSON.stringify(value).slice(0, 12000);
  } catch {
    return "";
  }
}

function workflowRunHistorySearchText(run: WorkflowRunPayload | null) {
  if (!run) return "";
  return [
    run.id,
    run.playbook,
    run.workspace,
    run.status,
    run.trigger,
    run.preset?.name,
    workflowRunResultSummary(run.playbook, run.result),
    ...(run.log ?? []),
    safeJsonSearchText(run.input),
    safeJsonSearchText(run.result),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function workflowRunMatchesHistorySearch(run: WorkflowRunPayload, search: string) {
  const terms = search
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return true;
  const haystack = workflowRunHistorySearchText(run);
  return terms.every((term) => haystack.includes(term));
}

function workflowRunPayload(run: WorkflowRunPayload | null, includeSearchText = false) {
  if (!run) return null;
  return {
    ...run,
    presetName: run.preset?.name ?? null,
    summary: workflowRunResultSummary(run.playbook, run.result),
    ...(includeSearchText ? { searchText: workflowRunHistorySearchText(run) } : {}),
  };
}

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const queue = await recoverWorkflowQueue(ownerId);
    const search = workflowRunHistorySearch(req);
    const limit = workflowRunHistoryLimit(req);
    const take = search ? 100 : limit;
    const runs = await db.workflowRun.findMany({
      where: { ownerId },
      include: { preset: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    const filtered = search
      ? runs.filter((run) => workflowRunMatchesHistorySearch(run, search)).slice(0, limit)
      : runs;
    return NextResponse.json({ runs: filtered.map((run) => workflowRunPayload(run, Boolean(search))), queue });
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

    const activeRuns = await db.workflowRun.findMany({
      where: {
        ownerId,
        playbook: parsed.data.playbook,
        status: { in: [...ACTIVE_WORKFLOW_RUN_STATUSES] },
        finishedAt: null,
      },
      include: { preset: { select: { name: true } } },
      orderBy: [{ queuePriority: "desc" }, { createdAt: "asc" }],
      take: 50,
    });
    const existing = parsed.data.playbook === "research-brief"
      ? findActiveResearchBriefRun(activeRuns, researchBriefIdentityFromInput(parsed.data))
      : activeRuns.find((run) => workflowRunInputMatchesActiveRun(parsed.data, run));
    if (existing) {
      return NextResponse.json({
        run: workflowRunPayload(existing),
        queued: false,
        existing: true,
        queue: await visibleWorkflowQueueSnapshotForOwner(ownerId),
      });
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

    if (parsed.data.action === "CANCEL_ALL") {
      const liveRuns = await db.workflowRun.findMany({
        where: { ownerId, status: { in: ["QUEUED", "RUNNING"] } },
        include: { preset: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      const now = new Date();
      await Promise.all(
        liveRuns.map((run) => {
          const removed = removeQueuedWorkflowRun(ownerId, run.id);
          const active = isActiveWorkflowRun(ownerId, run.id);
          return db.workflowRun.update({
            where: { id: run.id },
            include: { preset: { select: { name: true } } },
            data: {
              status: "CANCELED",
              finishedAt: now,
              log: {
                push: workflowLogEntry(
                  active && !removed
                    ? "Bulk cancel requested while worker was running; it will stop before the next side effect."
                    : "Bulk canceled before worker started.",
                ),
              },
            },
          });
        }),
      );
      const runs = await db.workflowRun.findMany({
        where: { ownerId },
        include: { preset: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: parsed.data.limit ?? 20,
      });
      return NextResponse.json({
        runs: runs.map((run) => workflowRunPayload(run)),
        queue: await visibleWorkflowQueueSnapshotForOwner(ownerId),
        canceled: liveRuns.length,
      });
    }

    await recoverWorkflowQueue(ownerId);
    if (!parsed.data.id) {
      return NextResponse.json({ error: "Workflow run id is required" }, { status: 400 });
    }
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
                ? "Cancel requested while worker was running; it will stop before the next side effect."
                : "Canceled before worker started.",
            ),
          },
        },
      });
      return NextResponse.json({ run: workflowRunPayload(run), queue: await visibleWorkflowQueueSnapshotForOwner(ownerId) });
    }

    const rerunBlockedMessage = workflowRunRerunBlockedMessage(source.status);
    if (rerunBlockedMessage) {
      return NextResponse.json({ error: rerunBlockedMessage }, { status: 409 });
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
