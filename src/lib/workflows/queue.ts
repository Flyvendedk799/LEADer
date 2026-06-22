import { executeWorkflowRun } from "./playbooks";
import { db } from "@/lib/db";
import { workflowLogEntry } from "./logging";
import { workflowRunInputSchema, type WorkflowRunInput } from "./types";

type QueuedWorkflowRun = {
  ownerId: string;
  runId: string;
  input: WorkflowRunInput;
};

export type WorkflowQueueMoveAction = "MOVE_UP" | "MOVE_DOWN" | "MOVE_TOP";

const queue: QueuedWorkflowRun[] = [];
let active: QueuedWorkflowRun | null = null;

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

export function reorderWorkflowQueueIds(ids: string[], runId: string, action: WorkflowQueueMoveAction) {
  const currentIndex = ids.indexOf(runId);
  if (currentIndex === -1) return { ids: [...ids], moved: false, reason: "not_queued" as const };
  if ((action === "MOVE_UP" || action === "MOVE_TOP") && currentIndex === 0) {
    return { ids: [...ids], moved: false, reason: "already_first" as const };
  }
  if (action === "MOVE_DOWN" && currentIndex === ids.length - 1) {
    return { ids: [...ids], moved: false, reason: "already_last" as const };
  }

  const nextIds = [...ids];
  const [run] = nextIds.splice(currentIndex, 1);
  if (action === "MOVE_TOP") {
    nextIds.unshift(run);
  } else if (action === "MOVE_UP") {
    nextIds.splice(currentIndex - 1, 0, run);
  } else {
    nextIds.splice(currentIndex + 1, 0, run);
  }

  return { ids: nextIds, moved: true, reason: null };
}

async function persistOwnerQueueOrder(ownerId: string) {
  const ownerQueue = queue.filter((item) => item.ownerId === ownerId);
  await Promise.all(
    ownerQueue.map((item, index) =>
      db.workflowRun.updateMany({
        where: { id: item.runId, ownerId, status: "QUEUED" },
        data: { queuePriority: ownerQueue.length - index },
      }),
    ),
  );
}

export async function reorderQueuedWorkflowRun(ownerId: string, runId: string, action: WorkflowQueueMoveAction) {
  const ownerIndexes = queue
    .map((item, index) => (item.ownerId === ownerId ? index : null))
    .filter((index): index is number => index !== null);
  const ownerRunIds = ownerIndexes.map((index) => queue[index].runId);
  const reordered = reorderWorkflowQueueIds(ownerRunIds, runId, action);

  if (!reordered.moved) {
    return { moved: false, reason: reordered.reason, queue: workflowQueueSnapshot(ownerId) };
  }

  const byRunId = new Map(ownerIndexes.map((index) => [queue[index].runId, queue[index]]));
  reordered.ids.forEach((nextRunId, ownerIndex) => {
    const item = byRunId.get(nextRunId);
    if (item) queue[ownerIndexes[ownerIndex]] = item;
  });

  await persistOwnerQueueOrder(ownerId);
  return { moved: true, reason: null, queue: workflowQueueSnapshot(ownerId) };
}

export function isActiveWorkflowRun(ownerId: string, runId: string) {
  return active?.ownerId === ownerId && active.runId === runId;
}

export function removeQueuedWorkflowRun(ownerId: string, runId: string) {
  const index = queue.findIndex((item) => item.ownerId === ownerId && item.runId === runId);
  if (index === -1) return false;
  queue.splice(index, 1);
  return true;
}

export function workflowQueueSnapshot(ownerId?: string) {
  const visibleQueue = ownerId ? queue.filter((item) => item.ownerId === ownerId) : queue;
  return {
    activeRunId: !ownerId || active?.ownerId === ownerId ? active?.runId ?? null : null,
    queuedRunIds: visibleQueue.map((item) => item.runId),
  };
}

export function filterVisibleWorkflowQueueSnapshot(
  snapshot: ReturnType<typeof workflowQueueSnapshot>,
  liveRunIds: Iterable<string>,
) {
  const live = new Set(liveRunIds);
  return {
    activeRunId: snapshot.activeRunId && live.has(snapshot.activeRunId) ? snapshot.activeRunId : null,
    queuedRunIds: snapshot.queuedRunIds.filter((id) => live.has(id)),
  };
}

export async function visibleWorkflowQueueSnapshotForOwner(ownerId: string) {
  const liveRuns = await db.workflowRun.findMany({
    where: {
      ownerId,
      status: { in: ["QUEUED", "RUNNING"] },
      finishedAt: null,
    },
    select: { id: true },
  });
  return filterVisibleWorkflowQueueSnapshot(
    workflowQueueSnapshot(ownerId),
    liveRuns.map((run) => run.id),
  );
}

export async function recoverWorkflowQueue(ownerId: string) {
  const runs = await db.workflowRun.findMany({
    where: {
      ownerId,
      status: { in: ["QUEUED", "RUNNING"] },
      finishedAt: null,
    },
    orderBy: [{ queuePriority: "desc" }, { createdAt: "asc" }],
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

  return visibleWorkflowQueueSnapshotForOwner(ownerId);
}
