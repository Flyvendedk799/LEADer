import { describe, expect, it } from "vitest";

import { filterVisibleDiscoveryQueueSnapshot, reorderDiscoveryQueueIds } from "./discovery-queue";

describe("discovery queue ordering", () => {
  it("moves waiting missions up, down, and to the top without mutating the source order", () => {
    const source = ["mission-1", "mission-2", "mission-3"];

    expect(reorderDiscoveryQueueIds(source, "mission-3", "MOVE_TOP")).toEqual({
      ids: ["mission-3", "mission-1", "mission-2"],
      moved: true,
      reason: null,
    });
    expect(reorderDiscoveryQueueIds(source, "mission-3", "MOVE_UP")).toEqual({
      ids: ["mission-1", "mission-3", "mission-2"],
      moved: true,
      reason: null,
    });
    expect(reorderDiscoveryQueueIds(source, "mission-1", "MOVE_DOWN")).toEqual({
      ids: ["mission-2", "mission-1", "mission-3"],
      moved: true,
      reason: null,
    });
    expect(source).toEqual(["mission-1", "mission-2", "mission-3"]);
  });

  it("reports no-op move requests clearly", () => {
    expect(reorderDiscoveryQueueIds(["mission-1", "mission-2"], "mission-1", "MOVE_TOP")).toEqual({
      ids: ["mission-1", "mission-2"],
      moved: false,
      reason: "already_first",
    });
    expect(reorderDiscoveryQueueIds(["mission-1", "mission-2"], "mission-2", "MOVE_DOWN")).toEqual({
      ids: ["mission-1", "mission-2"],
      moved: false,
      reason: "already_last",
    });
    expect(reorderDiscoveryQueueIds(["mission-1", "mission-2"], "mission-3", "MOVE_UP")).toEqual({
      ids: ["mission-1", "mission-2"],
      moved: false,
      reason: "not_queued",
    });
  });

  it("hides active or queued missions that are no longer live", () => {
    expect(
      filterVisibleDiscoveryQueueSnapshot(
        { activeMissionId: "mission-1", queuedMissionIds: ["mission-2", "mission-3"] },
        ["mission-2"],
      ),
    ).toEqual({
      activeMissionId: null,
      queuedMissionIds: ["mission-2"],
    });
  });
});
