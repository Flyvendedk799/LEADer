export type DiscoveryQueueSnapshot = {
  activeMissionId: string | null;
  queuedMissionIds: string[];
};

export function discoveryLogEntry(message: string, now = new Date()) {
  return `${now.toISOString()} ${message}`;
}

export function formatDiscoveryElapsed(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function discoveryCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function discoveryLiveQueueCancelMessage(count: number) {
  return `${discoveryCountLabel(count, "mission")} stopped`;
}

export function discoveryQueueLogMessage(missionId: string, queue: DiscoveryQueueSnapshot) {
  if (queue.activeMissionId === missionId) {
    return "Background worker accepted mission; it will keep running if this tab is closed.";
  }

  const queuedIndex = queue.queuedMissionIds.indexOf(missionId);
  if (queuedIndex >= 0) {
    return `Background worker queued mission at position ${queuedIndex + 1}; it will run after active missions.`;
  }

  return "Background queue accepted mission.";
}
