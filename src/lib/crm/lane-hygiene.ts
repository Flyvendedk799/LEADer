import { db } from "@/lib/db";
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

  if (!invalid.length) return { dismissed: 0, reasons: [] as string[] };

  await Promise.all(
    invalid.map((candidate) =>
      db.discoveryCandidate.updateMany({
        where: { id: candidate.id, ownerId, status: "NEW" },
        data: {
          status: "DISMISSED",
          dismissalReason: dismissalReason(candidate.reason),
        },
      }),
    ),
  );

  return {
    dismissed: invalid.length,
    reasons: [...new Set(invalid.map((candidate) => candidate.reason))],
  };
}
