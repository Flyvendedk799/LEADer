import { laneCandidateGate, type CandidateLike, type LaneLike } from "@/lib/crm/lanes";

const HIDDEN_REVIEW_STATUSES = new Set(["DISMISSED", "DUPLICATE"]);
const STATUS_HIDDEN_GROUP = "dismissed or duplicate candidate";

function hiddenStatusLabel(count: number) {
  return `${count} dismissed or duplicate ${count === 1 ? "candidate" : "candidates"}`;
}

export function discoveryMissionProviderLabel(mission: {
  provider?: string | null;
  lane?: { slug?: string | null } | null;
  log?: string[] | null;
}) {
  if (mission.provider && mission.provider !== "none") return mission.provider;
  const usedOfficialTenderIndex =
    mission.lane?.slug === "tenders-procurement" &&
    (mission.log ?? []).some((entry) => /udbud\.dk returned|official udbud\.dk index/.test(entry));
  if (usedOfficialTenderIndex) return "udbud.dk";
  return mission.provider ?? null;
}

export function discoveryMissionDisplayWarnings(
  mission: {
    provider?: string | null;
    lane?: { slug?: string | null } | null;
    log?: string[] | null;
  },
  warnings: string[] = [],
) {
  if (discoveryMissionProviderLabel(mission) !== "udbud.dk") return warnings;
  return warnings.filter((warning) => !/No web search API key configured/i.test(warning));
}

export function filterReviewableDiscoveryCandidates<T extends CandidateLike & { status?: string | null }>(
  lane: LaneLike | null | undefined,
  candidates: T[],
) {
  const split = splitReviewableDiscoveryCandidates(lane, candidates);
  return {
    candidates: split.candidates,
    removed: split.removed,
    reasons: split.reasons,
  };
}

function hiddenCandidateReason(lane: LaneLike | null | undefined, candidate: CandidateLike & { status?: string | null }) {
  if (lane) {
    const gate = laneCandidateGate(lane, candidate);
    if (!gate.allowed) {
      const reason = gate.reason ?? "off-lane result";
      return { reason, group: reason };
    }
  }

  const status = String(candidate.status ?? "").toUpperCase();
  if (HIDDEN_REVIEW_STATUSES.has(status)) {
    return {
      reason: status === "DUPLICATE" ? "duplicate candidate" : "dismissed candidate",
      group: STATUS_HIDDEN_GROUP,
    };
  }

  return null;
}

export function splitReviewableDiscoveryCandidates<T extends CandidateLike & { status?: string | null }>(
  lane: LaneLike | null | undefined,
  candidates: T[],
) {
  const reasonCounts = new Map<string, number>();
  const reviewable: T[] = [];
  const hidden: Array<T & { hiddenReason: string }> = [];

  for (const candidate of candidates) {
    const hiddenReason = hiddenCandidateReason(lane, candidate);
    if (!hiddenReason) {
      reviewable.push(candidate);
      continue;
    }
    reasonCounts.set(hiddenReason.group, (reasonCounts.get(hiddenReason.group) ?? 0) + 1);
    hidden.push({ ...candidate, hiddenReason: hiddenReason.reason });
  }

  const reasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => (reason === STATUS_HIDDEN_GROUP ? hiddenStatusLabel(count) : `${count} ${reason}`));

  return {
    candidates: reviewable,
    hidden,
    removed: hidden.length,
    reasons,
  };
}

export function hiddenDiscoveryCandidatesWarning(removed: number, reasons: string[]) {
  if (removed <= 0) return null;
  return `${removed} dismissed, duplicate, stale or off-lane candidates hidden from this mission: ${reasons.slice(0, 3).join("; ")}.`;
}
