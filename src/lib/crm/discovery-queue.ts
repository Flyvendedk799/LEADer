import { executeDiscoveryMission, type DiscoveryMissionInput } from "@/lib/crm";
import { discoveryLogEntry } from "@/lib/crm/discovery-logging";
import { db } from "@/lib/db";
import { discoveryRunCreateSchema } from "@/lib/validators";

type QueuedMission = {
  ownerId: string;
  missionId: string;
  input: DiscoveryMissionInput;
};

export type DiscoveryQueueMoveAction = "MOVE_UP" | "MOVE_DOWN" | "MOVE_TOP";

const queue: QueuedMission[] = [];
let active: QueuedMission | null = null;

function isInMemory(missionId: string) {
  return active?.missionId === missionId || queue.some((item) => item.missionId === missionId);
}

function drainQueue() {
  if (active) return;
  const next = queue.shift();
  if (!next) return;
  active = next;
  void executeDiscoveryMission(next.ownerId, next.missionId, next.input)
    .catch(() => {
      // executeDiscoveryMission records ERROR on the mission; callers poll the DB.
    })
    .finally(() => {
      active = null;
      drainQueue();
    });
}

export function enqueueDiscoveryMission(ownerId: string, missionId: string, input: DiscoveryMissionInput) {
  if (isInMemory(missionId)) return false;
  queue.push({ ownerId, missionId, input });
  drainQueue();
  return true;
}

export function reorderDiscoveryQueueIds(ids: string[], missionId: string, action: DiscoveryQueueMoveAction) {
  const currentIndex = ids.indexOf(missionId);
  if (currentIndex === -1) return { ids: [...ids], moved: false, reason: "not_queued" as const };
  if ((action === "MOVE_UP" || action === "MOVE_TOP") && currentIndex === 0) {
    return { ids: [...ids], moved: false, reason: "already_first" as const };
  }
  if (action === "MOVE_DOWN" && currentIndex === ids.length - 1) {
    return { ids: [...ids], moved: false, reason: "already_last" as const };
  }

  const nextIds = [...ids];
  const [mission] = nextIds.splice(currentIndex, 1);
  if (action === "MOVE_TOP") {
    nextIds.unshift(mission);
  } else if (action === "MOVE_UP") {
    nextIds.splice(currentIndex - 1, 0, mission);
  } else {
    nextIds.splice(currentIndex + 1, 0, mission);
  }

  return { ids: nextIds, moved: true, reason: null };
}

export function reorderQueuedDiscoveryMission(ownerId: string, missionId: string, action: DiscoveryQueueMoveAction) {
  const ownerIndexes = queue
    .map((item, index) => (item.ownerId === ownerId ? index : null))
    .filter((index): index is number => index !== null);
  const ownerMissionIds = ownerIndexes.map((index) => queue[index].missionId);
  const reordered = reorderDiscoveryQueueIds(ownerMissionIds, missionId, action);

  if (!reordered.moved) {
    return { moved: false, reason: reordered.reason, queue: discoveryQueueSnapshot(ownerId) };
  }

  const byMissionId = new Map(ownerIndexes.map((index) => [queue[index].missionId, queue[index]]));
  reordered.ids.forEach((nextMissionId, ownerIndex) => {
    const item = byMissionId.get(nextMissionId);
    if (item) queue[ownerIndexes[ownerIndex]] = item;
  });

  return { moved: true, reason: null, queue: discoveryQueueSnapshot(ownerId) };
}

export function isActiveDiscoveryMission(ownerId: string, missionId: string) {
  return active?.ownerId === ownerId && active.missionId === missionId;
}

export function removeQueuedDiscoveryMission(ownerId: string, missionId: string) {
  const index = queue.findIndex((item) => item.ownerId === ownerId && item.missionId === missionId);
  if (index === -1) return false;
  queue.splice(index, 1);
  return true;
}

export function discoveryQueueSnapshot(ownerId?: string) {
  const visibleQueue = ownerId ? queue.filter((item) => item.ownerId === ownerId) : queue;
  return {
    activeMissionId: !ownerId || active?.ownerId === ownerId ? active?.missionId ?? null : null,
    queuedMissionIds: visibleQueue.map((item) => item.missionId),
  };
}

export function filterVisibleDiscoveryQueueSnapshot(
  snapshot: ReturnType<typeof discoveryQueueSnapshot>,
  liveMissionIds: Iterable<string>,
) {
  const live = new Set(liveMissionIds);
  return {
    activeMissionId: snapshot.activeMissionId && live.has(snapshot.activeMissionId) ? snapshot.activeMissionId : null,
    queuedMissionIds: snapshot.queuedMissionIds.filter((id) => live.has(id)),
  };
}

export async function visibleDiscoveryQueueSnapshotForOwner(ownerId: string) {
  const liveMissions = await db.discoveryMission.findMany({
    where: {
      ownerId,
      status: { in: ["QUEUED", "RUNNING"] },
      finishedAt: null,
    },
    select: { id: true },
  });
  return filterVisibleDiscoveryQueueSnapshot(
    discoveryQueueSnapshot(ownerId),
    liveMissions.map((mission) => mission.id),
  );
}

export async function recoverDiscoveryQueue(ownerId: string) {
  const missions = await db.discoveryMission.findMany({
    where: {
      ownerId,
      status: { in: ["QUEUED", "RUNNING"] },
      finishedAt: null,
    },
    orderBy: { startedAt: "asc" },
    select: { id: true, status: true, input: true },
  });

  for (const mission of missions) {
    if (isInMemory(mission.id)) continue;
    const parsed = discoveryRunCreateSchema.safeParse(mission.input ?? {});
    if (!parsed.success) {
      await db.discoveryMission.update({
        where: { id: mission.id },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
          warnings: ["Mission could not be recovered because its queued input is missing or invalid."],
          log: { push: discoveryLogEntry("Recovery failed: queued input was missing or invalid.") },
        },
      });
      continue;
    }

    await db.discoveryMission.update({
      where: { id: mission.id },
      data: {
        status: "QUEUED",
        log: {
          push:
            mission.status === "RUNNING"
              ? discoveryLogEntry("Recovered orphaned running mission after restart; queued again.")
              : discoveryLogEntry("Recovered queued mission after restart."),
        },
      },
    });
    enqueueDiscoveryMission(ownerId, mission.id, parsed.data);
  }

  return visibleDiscoveryQueueSnapshotForOwner(ownerId);
}
