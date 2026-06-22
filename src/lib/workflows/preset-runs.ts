import type { WorkflowPreset } from "@prisma/client";

import { db } from "@/lib/db";
import { createWorkflowRun } from "./playbooks";
import { presetToWorkflowInput, nextWorkflowPresetRunAt, isWorkflowPresetDue } from "./presets";
import { enqueueWorkflowRun, workflowQueueSnapshot } from "./queue";
import { workflowRunResultSummary } from "./result-summary";

export const ACTIVE_WORKFLOW_RUN_STATUSES = ["QUEUED", "RUNNING"] as const;

type QueuePresetOptions = {
  scheduled?: boolean;
  now?: Date;
};

type ActiveWorkflowPresetRun = {
  id: string;
  status: string;
  trigger: string;
  createdAt: Date;
};

function workflowRunPayload(run: Awaited<ReturnType<typeof createWorkflowRun>>, presetName?: string | null) {
  return {
    ...run,
    presetName: presetName ?? null,
    summary: workflowRunResultSummary(run.playbook, run.result),
  };
}

export async function queueWorkflowPresetRun(
  ownerId: string,
  preset: Pick<
    WorkflowPreset,
    "id" | "ownerId" | "name" | "playbook" | "workspace" | "options" | "scheduleIntervalHours"
  >,
  options: QueuePresetOptions = {},
) {
  if (preset.ownerId !== ownerId) throw new Error("Workflow preset not found");

  const now = options.now ?? new Date();
  const input = presetToWorkflowInput(preset);
  const run = await createWorkflowRun(ownerId, input, "QUEUED", {
    trigger: options.scheduled ? "schedule" : "preset",
    presetId: preset.id,
    presetName: preset.name,
  });
  await db.workflowPreset.update({
    where: { id: preset.id },
    data: {
      lastQueuedAt: now,
      lastScheduledAt: options.scheduled ? now : undefined,
      scheduleNextRunAt: options.scheduled ? nextWorkflowPresetRunAt(now, preset.scheduleIntervalHours) : undefined,
    },
  });
  enqueueWorkflowRun(ownerId, run.id, input);

  return {
    run: workflowRunPayload(run, preset.name),
    queued: true,
    queue: workflowQueueSnapshot(ownerId),
  };
}

export type QueuedScheduledPreset = {
  presetId: string;
  presetName: string;
  runId?: string;
  nextRunAt?: string | null;
  status: "QUEUED" | "SKIPPED" | "ERROR";
  skipReason?: "already_running" | "not_due";
  activeRunId?: string;
  activeRunStatus?: string;
  error?: string;
};

export function scheduledPresetOverlapSkipResult(
  preset: Pick<WorkflowPreset, "id" | "name">,
  activeRun: Pick<ActiveWorkflowPresetRun, "id" | "status">,
): QueuedScheduledPreset {
  return {
    presetId: preset.id,
    presetName: preset.name,
    status: "SKIPPED",
    skipReason: "already_running",
    activeRunId: activeRun.id,
    activeRunStatus: activeRun.status,
  };
}

export async function findActiveWorkflowPresetRun(ownerId: string, presetId: string) {
  return db.workflowRun.findFirst({
    where: {
      ownerId,
      presetId,
      status: { in: [...ACTIVE_WORKFLOW_RUN_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, trigger: true, createdAt: true },
  });
}

export async function queueDueWorkflowPresets(ownerId: string, now = new Date()): Promise<QueuedScheduledPreset[]> {
  const presets = await db.workflowPreset.findMany({
    where: {
      ownerId,
      scheduleEnabled: true,
      OR: [{ scheduleNextRunAt: null }, { scheduleNextRunAt: { lte: now } }],
    },
    orderBy: [{ scheduleNextRunAt: "asc" }, { updatedAt: "asc" }],
  });

  const results: QueuedScheduledPreset[] = [];
  for (const preset of presets) {
    if (!isWorkflowPresetDue(preset, now)) {
      results.push({ presetId: preset.id, presetName: preset.name, status: "SKIPPED", skipReason: "not_due" });
      continue;
    }

    const activeRun = await findActiveWorkflowPresetRun(ownerId, preset.id);
    if (activeRun) {
      results.push(scheduledPresetOverlapSkipResult(preset, activeRun));
      continue;
    }

    try {
      const queued = await queueWorkflowPresetRun(ownerId, preset, { scheduled: true, now });
      const refreshed = await db.workflowPreset.findUnique({
        where: { id: preset.id },
        select: { scheduleNextRunAt: true },
      });
      results.push({
        presetId: preset.id,
        presetName: preset.name,
        runId: queued.run.id,
        nextRunAt: refreshed?.scheduleNextRunAt?.toISOString() ?? null,
        status: "QUEUED",
      });
    } catch (error) {
      results.push({
        presetId: preset.id,
        presetName: preset.name,
        status: "ERROR",
        error: error instanceof Error ? error.message : "Could not queue preset",
      });
    }
  }

  return results;
}

export async function queueDueWorkflowPresetsAllOwners(now = new Date()) {
  const owners = await db.user.findMany({
    where: { workflowPresets: { some: { scheduleEnabled: true } } },
    select: { id: true },
  });

  const byOwner: Record<string, QueuedScheduledPreset[]> = {};
  for (const owner of owners) {
    byOwner[owner.id] = await queueDueWorkflowPresets(owner.id, now);
  }
  return byOwner;
}
