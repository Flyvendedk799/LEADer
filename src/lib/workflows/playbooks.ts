import type { Prisma } from "@prisma/client";

import { dispatchForOwner, type DispatchResult } from "@/lib/alerts/dispatch";
import { db } from "@/lib/db";
import { runDueDiscovery, type RunResult } from "@/lib/ingestion";
import type { Workspace } from "@/lib/types";
import { summarizeSourceRuns, type SourceRunSummary } from "./summary";
import type { WorkflowRunInput } from "./types";

export type WorkflowPlaybook = "daily-sweep";

export type DailySweepResult = {
  playbook: "daily-sweep";
  workspace: Workspace;
  ranAt: string;
  durationMs: number;
  sources: SourceRunSummary & { results: RunResult[] };
  reminders: DispatchResult;
  digest: DispatchResult;
  log: string[];
};

function workflowLogEntry(message: string) {
  return `${new Date().toISOString()} ${message}`;
}

export function workflowRunSummary(result: DailySweepResult) {
  const failed = result.sources.failed ? `, ${result.sources.failed} failed` : "";
  return `${result.sources.ran} sources, ${result.sources.created} new, ${result.sources.updated} updated${failed}; ${result.reminders.created} reminders; ${result.digest.created} digest.`;
}

export async function createWorkflowRun(ownerId: string, input: WorkflowRunInput, status = "QUEUED") {
  return db.workflowRun.create({
    data: {
      ownerId,
      playbook: input.playbook,
      workspace: input.workspace,
      status,
      input: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
      log: [
        workflowLogEntry(
          `${status === "RUNNING" ? "Started" : "Queued"} ${input.playbook} playbook for ${input.workspace}.`,
        ),
      ],
      startedAt: status === "RUNNING" ? new Date() : null,
    },
  });
}

export async function executeWorkflowRun(ownerId: string, runId: string, input: WorkflowRunInput) {
  try {
    const started = await db.workflowRun.updateMany({
      where: { id: runId, ownerId, status: { not: "CANCELED" } },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        finishedAt: null,
        log: { push: workflowLogEntry("Worker started playbook.") },
      },
    });
    if (started.count === 0) {
      return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
    }

    const result = await runDailySweep(ownerId, input.workspace);
    const current = await db.workflowRun.findFirst({ where: { id: runId, ownerId }, select: { status: true } });
    if (current?.status === "CANCELED") {
      return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
    }

    for (const entry of result.log) {
      await db.workflowRun.update({ where: { id: runId }, data: { log: { push: entry } } });
    }

    const finished = await db.workflowRun.updateMany({
      where: { id: runId, ownerId, status: { not: "CANCELED" } },
      data: {
        status: "SUCCESS",
        result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        finishedAt: new Date(),
        log: { push: workflowLogEntry(`Playbook complete: ${workflowRunSummary(result)}`) },
      },
    });
    if (finished.count === 0) {
      return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
    }
    return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
  } catch (error) {
    await db.workflowRun.updateMany({
      where: { id: runId, ownerId, status: { not: "CANCELED" } },
      data: {
        status: "ERROR",
        result: {
          error: error instanceof Error ? error.message : "Workflow playbook failed",
        },
        finishedAt: new Date(),
        log: {
          push: workflowLogEntry(
            `Playbook failed: ${error instanceof Error ? error.message : "Workflow playbook failed"}`,
          ),
        },
      },
    }).catch(() => {});
    throw error;
  }
}

export async function runDailySweep(ownerId: string, workspace: Workspace = "DK"): Promise<DailySweepResult> {
  const startedAt = Date.now();
  const log = [workflowLogEntry(`Started daily sweep for ${workspace}.`)];

  const sourceResults = await runDueDiscovery(ownerId);
  const sourceSummary = summarizeSourceRuns(sourceResults);
  log.push(
    workflowLogEntry(
      `Checked due sources: ${sourceSummary.ran} ran, ${sourceSummary.created} new, ${sourceSummary.updated} updated, ${sourceSummary.failed} failed.`,
    ),
  );

  const alerts = await dispatchForOwner(ownerId, { digest: true, workspace });
  log.push(
    workflowLogEntry(
      `Generated alerts: ${alerts.reminders.created} reminders and ${alerts.digest?.created ?? 0} digest.`,
    ),
  );

  const durationMs = Date.now() - startedAt;
  log.push(workflowLogEntry(`Finished daily sweep in ${Math.round(durationMs / 1000)}s.`));

  return {
    playbook: "daily-sweep",
    workspace,
    ranAt: new Date().toISOString(),
    durationMs,
    sources: { ...sourceSummary, results: sourceResults },
    reminders: alerts.reminders,
    digest: alerts.digest ?? { created: 0, emailed: 0, provider: "none" },
    log,
  };
}
