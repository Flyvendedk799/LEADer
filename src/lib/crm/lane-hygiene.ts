import { db } from "@/lib/db";
import { discoveryCandidateDedupeKey, DUPLICATE_CANDIDATE_REASON } from "@/lib/crm/candidate-dedupe";
import { laneCandidateGate, type CandidateLike, type LaneLike } from "@/lib/crm/lanes";

export function invalidLaneCandidateReason(candidate: CandidateLike & { lane?: LaneLike | null }) {
  if (!candidate.lane) return null;
  const gate = laneCandidateGate(candidate.lane, candidate);
  return gate.allowed ? null : gate.reason ?? "off-lane result";
}

const AUTO_DISMISSAL_PREFIX = "Auto-dismissed by lane guard:";

function dismissalReason(reason: string) {
  return `${AUTO_DISMISSAL_PREFIX} ${reason}`;
}

function dismissalSignal(reason: string) {
  return `rejected:${reason}`;
}

function rejectedReason(reason: string) {
  return `Rejected by lane guard: ${reason}`;
}

function hasPositiveScore(candidate: {
  matchScore?: number | null;
  confidenceScore?: number | null;
  pursuitScore?: number | null;
}) {
  return (
    (candidate.matchScore ?? 0) > 0 ||
    (candidate.confidenceScore ?? 0) > 0 ||
    (candidate.pursuitScore ?? 0) > 0
  );
}

export async function dismissInvalidNewLaneCandidates(ownerId: string, limit = 250) {
  const rows = await db.discoveryCandidate.findMany({
    where: {
      ownerId,
      laneId: { not: null },
      OR: [
        { status: "NEW" },
        { status: "DISMISSED" },
      ],
    },
    include: { lane: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const newRows = rows.filter((candidate) => String(candidate.status ?? "NEW").toUpperCase() === "NEW");
  const staleAutoRejectedIds = rows
    .filter((candidate) => {
      const status = String(candidate.status ?? "").toUpperCase();
      return (
        status === "DISMISSED" &&
        candidate.dismissalReason?.startsWith(AUTO_DISMISSAL_PREFIX) &&
        hasPositiveScore(candidate)
      );
    })
    .map((candidate) => candidate.id);

  const invalid = newRows
    .map((candidate) => ({
      id: candidate.id,
      reason: invalidLaneCandidateReason(candidate),
    }))
    .filter((candidate): candidate is { id: string; reason: string } => Boolean(candidate.reason));

  const dismissedRepairs = rows
    .filter((candidate) => String(candidate.status ?? "").toUpperCase() === "DISMISSED")
    .map((candidate) => ({
      candidate,
      reason: invalidLaneCandidateReason(candidate),
    }))
    .filter((item): item is { candidate: typeof rows[number]; reason: string } => Boolean(item.reason))
    .filter(({ candidate, reason }) => {
      const rejection = rejectedReason(reason);
      const signal = dismissalSignal(reason);
      const reasons = candidate.reasons ?? [];
      const signals = candidate.signals ?? [];
      return (
        candidate.dismissalReason !== dismissalReason(reason) ||
        hasPositiveScore(candidate) ||
        !reasons.includes(rejection) ||
        !signals.includes(signal)
      );
    });

  const dismissedRepairIds = new Set(dismissedRepairs.map(({ candidate }) => candidate.id));
  const staleRejectedIds = staleAutoRejectedIds.filter((id) => !dismissedRepairIds.has(id));

  const invalidIds = new Set(invalid.map((candidate) => candidate.id));
  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  for (const candidate of newRows) {
    if (invalidIds.has(candidate.id) || !candidate.lane) continue;
    const key = discoveryCandidateDedupeKey(candidate.lane, candidate);
    if (!key) continue;
    if (seen.has(key)) {
      duplicateIds.push(candidate.id);
      continue;
    }
    seen.add(key);
  }

  if (!invalid.length && !duplicateIds.length && !dismissedRepairs.length && !staleRejectedIds.length) {
    return {
      dismissed: 0,
      reasons: [] as string[],
      duplicated: 0,
      duplicateReasons: [] as string[],
      normalizedRejected: 0,
    };
  }

  await Promise.all(
    [
      ...invalid.map((candidate) =>
        db.discoveryCandidate.updateMany({
          where: { id: candidate.id, ownerId, status: "NEW" },
          data: {
            status: "DISMISSED",
            dismissalReason: dismissalReason(candidate.reason),
            matchScore: 0,
            confidenceScore: 0,
            pursuitScore: 0,
            reasons: { push: `Rejected by lane guard: ${candidate.reason}` },
            signals: { push: dismissalSignal(candidate.reason) },
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
      ...dismissedRepairs.map(({ candidate, reason }) => {
        const rejection = rejectedReason(reason);
        const signal = dismissalSignal(reason);
        const reasons = candidate.reasons ?? [];
        const signals = candidate.signals ?? [];
        return db.discoveryCandidate.updateMany({
          where: { id: candidate.id, ownerId, status: "DISMISSED" },
          data: {
            dismissalReason: dismissalReason(reason),
            matchScore: 0,
            confidenceScore: 0,
            pursuitScore: 0,
            ...(!reasons.includes(rejection) ? { reasons: { push: rejection } } : {}),
            ...(!signals.includes(signal) ? { signals: { push: signal } } : {}),
          },
        });
      }),
      ...staleRejectedIds.map((id) =>
        db.discoveryCandidate.updateMany({
          where: { id, ownerId, status: "DISMISSED" },
          data: {
            matchScore: 0,
            confidenceScore: 0,
            pursuitScore: 0,
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
    normalizedRejected: dismissedRepairs.length + staleRejectedIds.length,
  };
}
