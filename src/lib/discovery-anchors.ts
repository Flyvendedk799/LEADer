export function discoveryCandidateHashId(hash?: string | null) {
  const raw = (hash ?? "").startsWith("#") ? (hash ?? "").slice(1) : (hash ?? "");
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.startsWith("candidate-") ? decoded : null;
}

export function discoveryRejectedAnchorKey(missionId: string, hashId: string) {
  return `${missionId}:${hashId}`;
}

export function shouldLoadRejectedDiscoveryAnchor(input: {
  activeMissionId?: string | null;
  hashId?: string | null;
  rejectedCandidateCount: number;
  rejectedResultsOpen: boolean;
  attemptedKey?: string | null;
}) {
  if (!input.activeMissionId || !input.hashId) return false;
  if (input.rejectedCandidateCount <= 0 || input.rejectedResultsOpen) return false;
  return input.attemptedKey !== discoveryRejectedAnchorKey(input.activeMissionId, input.hashId);
}
