import { filterLaneCandidates, type CandidateLike, type LaneLike } from "@/lib/crm/lanes";

const HIDDEN_REVIEW_STATUSES = new Set(["DISMISSED", "DUPLICATE"]);

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
  const laneFiltered = lane
    ? filterLaneCandidates(lane, candidates)
    : { candidates, removed: 0, reasons: [] as string[] };
  const reviewable = laneFiltered.candidates.filter(
    (candidate) => !HIDDEN_REVIEW_STATUSES.has(String(candidate.status ?? "").toUpperCase()),
  );
  const statusHidden = laneFiltered.candidates.length - reviewable.length;
  return {
    candidates: reviewable,
    removed: laneFiltered.removed + statusHidden,
    reasons: [
      ...laneFiltered.reasons,
      ...(statusHidden > 0 ? [hiddenStatusLabel(statusHidden)] : []),
    ],
  };
}

export function hiddenDiscoveryCandidatesWarning(removed: number, reasons: string[]) {
  if (removed <= 0) return null;
  return `${removed} dismissed, duplicate, stale or off-lane candidates hidden from this mission: ${reasons.slice(0, 3).join("; ")}.`;
}
