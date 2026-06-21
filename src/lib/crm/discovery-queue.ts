import { executeDiscoveryMission, type DiscoveryMissionInput } from "@/lib/crm";

type QueuedMission = {
  ownerId: string;
  missionId: string;
  input: DiscoveryMissionInput;
};

const queue: QueuedMission[] = [];
let active: QueuedMission | null = null;

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
  queue.push({ ownerId, missionId, input });
  drainQueue();
}

export function discoveryQueueSnapshot() {
  return {
    activeMissionId: active?.missionId ?? null,
    queuedMissionIds: queue.map((item) => item.missionId),
  };
}
