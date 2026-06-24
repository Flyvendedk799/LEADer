import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import {
  DEFAULT_HISTORY_SCOPE,
  mergeMissionHistory,
  missionMatchesHistoryScope,
  missionTenderQualitySummary,
  type MissionSummary,
} from "./lane-mission-control";

function mission(index: number, laneId?: string): MissionSummary {
  return {
    id: `mission-${index}`,
    status: "SUCCESS",
    startedAt: new Date(Date.UTC(2026, 5, 24, 10, 0, index)).toISOString(),
    query: `query ${index}`,
    lane: laneId ? { id: laneId, name: laneId === "tender-lane" ? "Tenders / procurement" : "Direct startup" } : undefined,
    warnings: [],
    _count: { candidates: 0 },
    hiddenCandidateCount: 0,
  };
}

describe("lane mission history", () => {
  it("defaults history to all lanes so old runs stay recoverable", () => {
    expect(DEFAULT_HISTORY_SCOPE).toBe("all");
  });

  it("preserves the loaded history window when a mission refresh is merged", () => {
    const loaded = Array.from({ length: 40 }, (_, index) => mission(index));
    const refreshed = { ...mission(12), status: "RUNNING" };

    const merged = mergeMissionHistory(loaded, refreshed, 40);

    expect(merged).toHaveLength(40);
    expect(merged.filter((item) => item.id === "mission-12")).toHaveLength(1);
    expect(merged.find((item) => item.id === "mission-12")?.status).toBe("RUNNING");
    expect(merged.map((item) => item.id)).toContain("mission-0");
  });

  it("uses the configured cap for newly inserted mission rows", () => {
    const loaded = Array.from({ length: 40 }, (_, index) => mission(index));
    const newest = { ...mission(99), startedAt: "2026-06-24T11:00:00.000Z" };

    const merged = mergeMissionHistory(loaded, newest, 40);

    expect(merged).toHaveLength(40);
    expect(merged[0]?.id).toBe("mission-99");
    expect(merged.map((item) => item.id)).not.toContain("mission-0");
  });

  it("keeps mission history scoped to the selected lane unless all lanes is requested", () => {
    const tenderMission = mission(1, "tender-lane");
    const startupMission = mission(2, "startup-lane");

    expect(missionMatchesHistoryScope(tenderMission, "tender-lane", "current-lane")).toBe(true);
    expect(missionMatchesHistoryScope(startupMission, "tender-lane", "current-lane")).toBe(false);
    expect(missionMatchesHistoryScope(startupMission, "tender-lane", "all")).toBe(true);
  });

  it("summarizes official tender run quality in mission history", () => {
    expect(
      missionTenderQualitySummary({
        ...mission(3, "tender-lane"),
        lane: { id: "tender-lane", name: "Tenders / procurement", slug: "tenders-procurement" },
        provider: "udbud.dk",
        _count: { candidates: 4 },
        hiddenCandidateCount: 1,
      }),
    ).toBe("4 active tenders ready for review · 1 rejected result · official udbud.dk.");

    expect(
      missionTenderQualitySummary({
        ...mission(4, "tender-lane"),
        lane: { id: "tender-lane", name: "Tenders / procurement", slug: "tenders-procurement" },
        provider: "brave",
        _count: { candidates: 0 },
        hiddenCandidateCount: 8,
        warnings: ["Tender quality gate rejected 8 candidates: 5 generic tender title without active deadline."],
      }),
    ).toBe(
      "8 results found, all rejected by tender quality gates. Tender quality gate rejected 8 candidates: 5 generic tender title without active deadline.",
    );
  });
});
