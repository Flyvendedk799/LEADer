import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeDiscoveryMission: vi.fn(() => new Promise(() => {})),
  db: {
    discoveryMission: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

vi.mock("@/lib/crm", () => ({ executeDiscoveryMission: mocks.executeDiscoveryMission }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { discoveryQueueSnapshot, enqueueDiscoveryMission, reorderQueuedDiscoveryMission } from "./discovery-queue";
import type { DiscoveryMissionInput } from "@/lib/crm";

const input: DiscoveryMissionInput = {
  laneId: "lane-1",
  query: "software udbud",
  maxResults: 8,
  includeWeb: true,
  includeSources: true,
  provider: "auto",
};

describe("discovery queue persistence", () => {
  it("persists waiting queue order when discovery missions are reprioritized", async () => {
    enqueueDiscoveryMission("owner-1", "mission-1", input);
    enqueueDiscoveryMission("owner-1", "mission-2", input);
    enqueueDiscoveryMission("owner-1", "mission-3", input);

    await expect(reorderQueuedDiscoveryMission("owner-1", "mission-3", "MOVE_TOP")).resolves.toEqual({
      moved: true,
      reason: null,
      queue: { activeMissionId: "mission-1", queuedMissionIds: ["mission-3", "mission-2"] },
    });

    expect(discoveryQueueSnapshot("owner-1")).toEqual({
      activeMissionId: "mission-1",
      queuedMissionIds: ["mission-3", "mission-2"],
    });
    expect(mocks.db.discoveryMission.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-3", ownerId: "owner-1", status: "QUEUED" },
      data: { queuePriority: 2 },
    });
    expect(mocks.db.discoveryMission.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-2", ownerId: "owner-1", status: "QUEUED" },
      data: { queuePriority: 1 },
    });
  });
});
