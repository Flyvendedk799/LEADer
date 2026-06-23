import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  createDiscoveryMission: vi.fn(),
  dismissInvalidNewLaneCandidates: vi.fn(),
  discoveryMissionDisplayWarnings: vi.fn(),
  discoveryMissionProviderLabel: vi.fn(),
  filterLaneCandidates: vi.fn(),
  db: {
    discoveryMission: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  discoveryQueueSnapshot: vi.fn(),
  enqueueDiscoveryMission: vi.fn(),
  isActiveDiscoveryMission: vi.fn(),
  recoverDiscoveryQueue: vi.fn(),
  removeQueuedDiscoveryMission: vi.fn(),
  reorderQueuedDiscoveryMission: vi.fn(),
  visibleDiscoveryQueueSnapshotForOwner: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwnerId: mocks.requireOwnerId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/crm", () => ({ createDiscoveryMission: mocks.createDiscoveryMission }));
vi.mock("@/lib/crm/discovery-display", () => ({
  discoveryMissionDisplayWarnings: mocks.discoveryMissionDisplayWarnings,
  discoveryMissionProviderLabel: mocks.discoveryMissionProviderLabel,
}));
vi.mock("@/lib/crm/lane-hygiene", () => ({
  dismissInvalidNewLaneCandidates: mocks.dismissInvalidNewLaneCandidates,
}));
vi.mock("@/lib/crm/lanes", () => ({ filterLaneCandidates: mocks.filterLaneCandidates }));
vi.mock("@/lib/crm/discovery-queue", () => ({
  discoveryQueueSnapshot: mocks.discoveryQueueSnapshot,
  enqueueDiscoveryMission: mocks.enqueueDiscoveryMission,
  isActiveDiscoveryMission: mocks.isActiveDiscoveryMission,
  recoverDiscoveryQueue: mocks.recoverDiscoveryQueue,
  removeQueuedDiscoveryMission: mocks.removeQueuedDiscoveryMission,
  reorderQueuedDiscoveryMission: mocks.reorderQueuedDiscoveryMission,
  visibleDiscoveryQueueSnapshotForOwner: mocks.visibleDiscoveryQueueSnapshotForOwner,
}));

import { PATCH } from "./route";

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/discovery/runs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("discovery run API controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerId.mockResolvedValue("owner-1");
    mocks.recoverDiscoveryQueue.mockResolvedValue({ activeMissionId: null, queuedMissionIds: [] });
  });

  it("blocks rerunning a live discovery mission", async () => {
    mocks.db.discoveryMission.findFirst.mockResolvedValue({
      id: "mission-1",
      ownerId: "owner-1",
      laneId: "lane-1",
      query: "software udbud",
      workspace: "DK",
      status: "RUNNING",
      provider: "none",
      input: {
        laneId: "lane-1",
        query: "software udbud",
        workspace: "DK",
        maxResults: 5,
        includeWeb: true,
        includeSources: false,
        provider: "none",
      },
    });

    const response = await PATCH(patchRequest({ id: "mission-1", action: "RERUN" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Wait for this discovery mission to finish before rerunning it.",
    });
    expect(mocks.createDiscoveryMission).not.toHaveBeenCalled();
    expect(mocks.enqueueDiscoveryMission).not.toHaveBeenCalled();
  });
});
