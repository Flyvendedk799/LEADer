import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { discoveryCandidateDedupeKeys, DUPLICATE_CANDIDATE_REASON } from "@/lib/crm/candidate-dedupe";
import { laneCandidateGate, TENDER_LANE_RELOCATION_REASONS, type CandidateLike, type LaneLike } from "@/lib/crm/lanes";
import { pursuitScore } from "@/lib/crm/scoring";
import { companyProfile } from "@/lib/company-profile";
import { applySupplierFit, SUPPLIER_FIT_VERSION, supplierFit } from "@/lib/crm/supplier-fit";

export const EXPIRED_DISMISSAL_PREFIX = "Auto-dismissed: deadline passed";

/** A deadline more than a day in the past (a day of slack covers date-only deadlines). */
export function deadlinePassed(deadline: Date | string | null | undefined, now = Date.now()) {
  if (!deadline) return false;
  const time = new Date(deadline).getTime();
  return Number.isFinite(time) && time + 86_400_000 < now;
}

/** Keeper order for duplicates: best pursuit score, then the tenders lane, then newest. */
export function duplicateKeeperOrder<T extends { pursuitScore?: number | null; createdAt?: Date | null; lane?: { slug: string } | null }>(a: T, b: T) {
  const score = (b.pursuitScore ?? 0) - (a.pursuitScore ?? 0);
  if (score) return score;
  const tender = Number(b.lane?.slug === "tenders-procurement") - Number(a.lane?.slug === "tenders-procurement");
  if (tender) return tender;
  return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
}

/**
 * Open candidates scored before supplier fit existed get it applied once.
 * Marked by scoreBreakdown.supplierFit.version and .capacityDkk, so each row is
 * rescored once per version and again when the contract-value limit changes. Rescoring starts from the lane-adjusted score, not a prior adjustment.
 */
export async function rescoreOpenCandidatesForSupplierFit(ownerId: string, limit = 300) {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { companyProfile: true } });
  const capacity = companyProfile(owner?.companyProfile).maxContractValueDkk;
  const ids = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "DiscoveryCandidate"
    WHERE "ownerId" = ${ownerId} AND status IN ('NEW', 'REVIEWED')
      AND (
        COALESCE(("scoreBreakdown"->'supplierFit'->>'version')::int, 0) < ${SUPPLIER_FIT_VERSION}
        OR COALESCE(("scoreBreakdown"->'supplierFit'->>'capacityDkk')::bigint, -1) <> ${capacity}
      )
    LIMIT ${limit}`;
  if (!ids.length) return 0;
  const rows = await db.discoveryCandidate.findMany({
    where: { id: { in: ids.map((r) => r.id) }, ownerId },
    select: {
      id: true, title: true, description: true, category: true, budgetMin: true, budgetMax: true, currency: true,
      deadline: true, matchScore: true, confidenceScore: true, scoreBreakdown: true, reasons: true, signals: true,
    },
  });
  for (const row of rows) {
    const breakdown = (row.scoreBreakdown ?? {}) as Record<string, unknown>;
    const laneFit = (breakdown.laneFit ?? {}) as { priority?: number };
    const fit = supplierFit(row, capacity);
    // Undo an earlier supplier adjustment so versions don't compound.
    const previous = (breakdown.supplierFit ?? null) as { delta?: number } | null;
    const matchScore = Math.max(0, Math.min(100, (row.matchScore ?? 50) - (previous?.delta ?? 0)));
    const adjusted = applySupplierFit(
      { matchScore, pursuitScore: pursuitScore({ matchScore, confidenceScore: row.confidenceScore, deadline: row.deadline, priority: laneFit.priority ?? 0 }) },
      fit,
    );
    await db.discoveryCandidate.updateMany({
      where: { id: row.id, ownerId, status: { in: ["NEW", "REVIEWED"] } },
      data: {
        matchScore: adjusted.matchScore,
        pursuitScore: adjusted.pursuitScore,
        scoreBreakdown: { ...breakdown, total: adjusted.matchScore, supplierFit: fit } as unknown as Prisma.InputJsonValue,
        reasons: [...new Set([...fit.reasons, ...row.reasons])].slice(0, 8),
        signals: [...new Set([...row.signals, ...fit.signals])].slice(0, 14),
      },
    });
  }
  return rows.length;
}

/** Leads whose deadline has passed leave the review queue. */
export async function dismissExpiredCandidates(ownerId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - 86_400_000);
  const { count } = await db.discoveryCandidate.updateMany({
    where: { ownerId, status: "NEW", dealId: null, deadline: { lt: cutoff } },
    data: { status: "DISMISSED", dismissalReason: EXPIRED_DISMISSAL_PREFIX },
  });
  return count;
}

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

/**
 * Full review-queue maintenance: expire passed deadlines, apply supplier fit to
 * older rows, then the lane guard, relocation and cross-lane dedupe.
 */
export async function maintainDiscoveryCandidates(ownerId: string, limit = 250) {
  await dismissExpiredCandidates(ownerId).catch(() => 0);
  await rescoreOpenCandidatesForSupplierFit(ownerId).catch(() => 0);
  return dismissInvalidNewLaneCandidates(ownerId, limit);
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

  // A public tender picked up by Funded work (without funding evidence) or by a
  // web lane belongs to the Tenders lane: move it there instead of dismissing it.
  const relocations: Array<{ id: string; laneId: string }> = [];
  if (invalid.some((candidate) => TENDER_LANE_RELOCATION_REASONS.has(candidate.reason))) {
    const tenderLane = await db.discoveryLane.findFirst({ where: { ownerId, slug: "tenders-procurement" } });
    if (tenderLane) {
      for (const item of invalid) {
        if (!TENDER_LANE_RELOCATION_REASONS.has(item.reason)) continue;
        const candidate = newRows.find((row) => row.id === item.id);
        if (candidate && laneCandidateGate(tenderLane, candidate).allowed) relocations.push({ id: item.id, laneId: tenderLane.id });
      }
    }
  }
  const relocatedIds = new Set(relocations.map((item) => item.id));
  const dismissals = invalid.filter((candidate) => !relocatedIds.has(candidate.id));
  const invalidIds = new Set(dismissals.map((candidate) => candidate.id));

  // Duplicates are found across lanes; the best-scoring copy stays.
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const candidate of [...newRows].sort(duplicateKeeperOrder)) {
    if (invalidIds.has(candidate.id) || !candidate.lane) continue;
    const keys = discoveryCandidateDedupeKeys(candidate);
    if (!keys.length) continue;
    if (keys.some((key) => seen.has(key))) {
      duplicateIds.push(candidate.id);
      continue;
    }
    keys.forEach((key) => seen.add(key));
  }

  if (!dismissals.length && !relocations.length && !duplicateIds.length && !dismissedRepairs.length && !staleRejectedIds.length) {
    return {
      dismissed: 0,
      relocated: 0,
      reasons: [] as string[],
      duplicated: 0,
      duplicateReasons: [] as string[],
      normalizedRejected: 0,
    };
  }

  await Promise.all(
    [
      ...relocations.map((item) =>
        db.discoveryCandidate.updateMany({
          where: { id: item.id, ownerId, status: "NEW" },
          data: { laneId: item.laneId, reasons: { push: "Moved to Tenders / procurement: public tender notice." } },
        }),
      ),
      ...dismissals.map((candidate) =>
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
    dismissed: dismissals.length,
    relocated: relocations.length,
    reasons: [...new Set(dismissals.map((candidate) => candidate.reason))],
    duplicated: duplicateIds.length,
    duplicateReasons: duplicateIds.length ? [DUPLICATE_CANDIDATE_REASON] : [],
    normalizedRejected: dismissedRepairs.length + staleRejectedIds.length,
  };
}
