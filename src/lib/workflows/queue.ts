import { executeWorkflowRun } from "./playbooks";
import { db } from "@/lib/db";
import { workflowRunInputSchema, type WorkflowRunInput } from "./types";

type QueuedWorkflowRun = {
  ownerId: string;
  runId: string;
  input: WorkflowRunInput;
};

const queue: QueuedWorkflowRun[] = [];
let active: QueuedWorkflowRun | null = null;

function workflowLogEntry(message: string) {
  return `${new Date().toISOString()} ${message}`;
}

function isInMemory(runId: string) {
  return active?.runId === runId || queue.some((item) => item.runId === runId);
}

function drainQueue() {
  if (active) return;
  const next = queue.shift();
  if (!next) return;
  active = next;
  void executeWorkflowRun(next.ownerId, next.runId, next.input)
    .catch(() => {
      // executeWorkflowRun records ERROR on the run; callers poll the DB.
    })
    .finally(() => {
      active = null;
      drainQueue();
    });
}

export function enqueueWorkflowRun(ownerId: string, runId: string, input: WorkflowRunInput) {
  if (isInMemory(runId)) return false;
  queue.push({ ownerId, runId, input });
  drainQueue();
  return true;
}

export function workflowQueueSnapshot(ownerId?: string) {
  const visibleQueue = ownerId ? queue.filter((item) => item.ownerId === ownerId) : queue;
  return {
    activeRunId: !ownerId || active?.ownerId === ownerId ? active?.runId ?? null : null,
    queuedRunIds: visibleQueue.map((item) => item.runId),
  };
}

export async function recoverWorkflowQueue(ownerId: string) {
  const runs = await db.workflowRun.findMany({
    where: {
      ownerId,
      status: { in: ["QUEUED", "RUNNING"] },
      finishedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, input: true },
  });

  for (const run of runs) {
    if (isInMemory(run.id)) continue;
    const parsed = workflowRunInputSchema.safeParse(run.input ?? {});
    if (!parsed.success) {
      await db.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
          log: { push: workflowLogEntry("Recovery failed: queued playbook input was missing or invalid.") },
        },
      });
      continue;
    }

    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "QUEUED",
        log: {
          push:
            run.status === "RUNNING"
              ? workflowLogEntry("Recovered orphaned running playbook after restart; queued again.")
              : workflowLogEntry("Recovered queued playbook after restart."),
        },
      },
    });
    enqueueWorkflowRun(ownerId, run.id, parsed.data);
  }

  return workflowQueueSnapshot(ownerId);
}
