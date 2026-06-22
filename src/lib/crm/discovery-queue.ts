import { executeDiscoveryMission, type DiscoveryMissionInput } from "@/lib/crm";
import { db } from "@/lib/db";
import { discoveryRunCreateSchema } from "@/lib/validators";

type QueuedMission = {
  ownerId: string;
  missionId: string;
  input: DiscoveryMissionInput;
};

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

export function discoveryQueueSnapshot(ownerId?: string) {
  const visibleQueue = ownerId ? queue.filter((item) => item.ownerId === ownerId) : queue;
  return {
    activeMissionId: !ownerId || active?.ownerId === ownerId ? active?.missionId ?? null : null,
    queuedMissionIds: visibleQueue.map((item) => item.missionId),
  };
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
          log: { push: `${new Date().toISOString()} Recovery failed: queued input was missing or invalid.` },
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
              ? `${new Date().toISOString()} Recovered orphaned running mission after restart; queued again.`
              : `${new Date().toISOString()} Recovered queued mission after restart.`,
        },
      },
    });
    enqueueDiscoveryMission(ownerId, mission.id, parsed.data);
  }

  return discoveryQueueSnapshot(ownerId);
}
