const LIVE_DISCOVERY_MISSION_STATUSES = new Set(["QUEUED", "RUNNING"]);

export function discoveryMissionCanRerun(status?: string | null) {
  return !LIVE_DISCOVERY_MISSION_STATUSES.has(String(status ?? "").toUpperCase());
}

export function discoveryMissionRerunBlockedMessage(status?: string | null) {
  return discoveryMissionCanRerun(status) ? null : "Wait for this discovery mission to finish before rerunning it.";
}
