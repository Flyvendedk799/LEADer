import { db } from "@/lib/db";
import { discoveryCandidateDedupeKey, DUPLICATE_CANDIDATE_REASON } from "@/lib/crm/candidate-dedupe";
import { laneCandidateGate, type CandidateLike, type LaneLike } from "@/lib/crm/lanes";

export function invalidLaneCandidateReason(candidate: CandidateLike & { lane?: LaneLike | null }) {
  if (!candidate.lane) return null;
  const gate = laneCandidateGate(candidate.lane, candidate);
  return gate.allowed ? null : gate.reason ?? "off-lane result";
}

function dismissalReason(reason: string) {
  return `Auto-dismissed by lane guard: ${reason}`;
}

export async function dismissInvalidNewLaneCandidates(ownerId: string, limit = 250) {
  const rows = await db.discoveryCandidate.findMany({
    where: {
      ownerId,
      status: "NEW",
      laneId: { not: null },
    },
    include: { lane: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const invalid = rows
    .map((candidate) => ({
      id: candidate.id,
      reason: invalidLaneCandidateReason(candidate),
    }))
    .filter((candidate): candidate is { id: string; reason: string } => Boolean(candidate.reason));

  const invalidIds = new Set(invalid.map((candidate) => candidate.id));
  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  for (const candidate of rows) {
    if (invalidIds.has(candidate.id) || !candidate.lane) continue;
    const key = discoveryCandidateDedupeKey(candidate.lane, candidate);
    if (!key) continue;
    if (seen.has(key)) {
      duplicateIds.push(candidate.id);
      continue;
    }
    seen.add(key);
  }

  if (!invalid.length && !duplicateIds.length) {
    return { dismissed: 0, reasons: [] as string[], duplicated: 0, duplicateReasons: [] as string[] };
  }

  await Promise.all(
    [
      ...invalid.map((candidate) =>
        db.discoveryCandidate.updateMany({
          where: { id: candidate.id, ownerId, status: "NEW" },
          data: {
            status: "DISMISSED",
            dismissalReason: dismissalReason(candidate.reason),
          },
        }),
      ),
      ...duplicateIds.map((id) =>
        db.discoveryCandidate.updateMany({
          where: { id, ownerId, status: "NEW" },
          data: {
            status: "DUPLICATE",
            reasons: { push: DUPLICATE_CANDIDATE_REASON },
          },
        }),
      ),
    ],
  );

  return {
    dismissed: invalid.length,
    reasons: [...new Set(invalid.map((candidate) => candidate.reason))],
    duplicated: duplicateIds.length,
    duplicateReasons: duplicateIds.length ? [DUPLICATE_CANDIDATE_REASON] : [],
  };
}
