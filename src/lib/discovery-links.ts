export function discoveryMissionHref(missionId?: string | null): string {
  return missionId ? `/discover?mission=${encodeURIComponent(missionId)}` : "/discover";
}

export function discoveryCandidateHref(missionId?: string | null, candidateId?: string | null): string {
  if (!missionId || !candidateId) return discoveryMissionHref(missionId);
  return `${discoveryMissionHref(missionId)}#candidate-${encodeURIComponent(candidateId)}`;
}
