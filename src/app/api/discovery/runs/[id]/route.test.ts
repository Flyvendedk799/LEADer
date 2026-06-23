import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  dismissInvalidNewLaneCandidates: vi.fn(),
  discoveryMissionDisplayWarnings: vi.fn(),
  discoveryMissionProviderLabel: vi.fn(),
  hiddenDiscoveryCandidatesWarning: vi.fn(),
  splitReviewableDiscoveryCandidates: vi.fn(),
  visibleDiscoveryQueueSnapshotForOwner: vi.fn(),
  db: {
    discoveryMission: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ requireOwnerId: mocks.requireOwnerId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/crm/lane-hygiene", () => ({
  dismissInvalidNewLaneCandidates: mocks.dismissInvalidNewLaneCandidates,
}));
vi.mock("@/lib/crm/discovery-queue", () => ({
  visibleDiscoveryQueueSnapshotForOwner: mocks.visibleDiscoveryQueueSnapshotForOwner,
}));
vi.mock("@/lib/crm/discovery-display", () => ({
  discoveryMissionDisplayWarnings: mocks.discoveryMissionDisplayWarnings,
  discoveryMissionProviderLabel: mocks.discoveryMissionProviderLabel,
  hiddenDiscoveryCandidatesWarning: mocks.hiddenDiscoveryCandidatesWarning,
  splitReviewableDiscoveryCandidates: mocks.splitReviewableDiscoveryCandidates,
}));

import { GET } from "./route";

function getRequest(includeHidden = false) {
  return new Request(`http://localhost/api/discovery/runs/mission-1${includeHidden ? "?includeHidden=1" : ""}`);
}

describe("discovery run detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerId.mockResolvedValue("owner-1");
    mocks.dismissInvalidNewLaneCandidates.mockResolvedValue({ dismissed: 0 });
    mocks.discoveryMissionDisplayWarnings.mockImplementation((_mission, warnings) => warnings);
    mocks.discoveryMissionProviderLabel.mockReturnValue("udbud.dk");
    mocks.hiddenDiscoveryCandidatesWarning.mockReturnValue("1 hidden candidate.");
    mocks.visibleDiscoveryQueueSnapshotForOwner.mockResolvedValue({ activeMissionId: null, queuedMissionIds: [] });
    mocks.db.discoveryMission.findFirst.mockResolvedValue({
      id: "mission-1",
      ownerId: "owner-1",
      lane: { slug: "tenders-procurement" },
      warnings: [],
      candidates: [{ id: "visible" }, { id: "hidden" }],
    });
    mocks.splitReviewableDiscoveryCandidates.mockReturnValue({
      candidates: [{ id: "visible" }],
      hidden: [{ id: "hidden", hiddenReason: "archived tender URL" }],
      removed: 1,
      reasons: ["1 archived tender URL"],
    });
  });

  it("keeps hidden candidates out of mission detail by default", async () => {
    const response = await GET(getRequest(), { params: { id: "mission-1" } });
    const body = await response.json();

    expect(body.mission.candidates).toEqual([{ id: "visible" }]);
    expect(body.hiddenCandidateCount).toBe(1);
    expect(body.hiddenCandidates).toEqual([]);
    expect(body.mission.warnings).toEqual(["1 hidden candidate."]);
  });

  it("returns hidden candidates when explicitly requested", async () => {
    const response = await GET(getRequest(true), { params: { id: "mission-1" } });
    const body = await response.json();

    expect(body.hiddenCandidateCount).toBe(1);
    expect(body.hiddenCandidates).toEqual([{ id: "hidden", hiddenReason: "archived tender URL" }]);
  });
});
