import { describe, expect, it } from "vitest";

import { filterVisibleWorkflowQueueSnapshot, reorderWorkflowQueueIds } from "./queue";

describe("workflow queue ordering", () => {
  it("moves waiting runs up, down, and to the top without mutating the source order", () => {
    const source = ["run-1", "run-2", "run-3"];

    expect(reorderWorkflowQueueIds(source, "run-3", "MOVE_TOP")).toEqual({
      ids: ["run-3", "run-1", "run-2"],
      moved: true,
      reason: null,
    });
    expect(reorderWorkflowQueueIds(source, "run-3", "MOVE_UP")).toEqual({
      ids: ["run-1", "run-3", "run-2"],
      moved: true,
      reason: null,
    });
    expect(reorderWorkflowQueueIds(source, "run-1", "MOVE_DOWN")).toEqual({
      ids: ["run-2", "run-1", "run-3"],
      moved: true,
      reason: null,
    });
    expect(source).toEqual(["run-1", "run-2", "run-3"]);
  });

  it("reports no-op move requests clearly", () => {
    expect(reorderWorkflowQueueIds(["run-1", "run-2"], "run-1", "MOVE_TOP")).toEqual({
      ids: ["run-1", "run-2"],
      moved: false,
      reason: "already_first",
    });
    expect(reorderWorkflowQueueIds(["run-1", "run-2"], "run-2", "MOVE_DOWN")).toEqual({
      ids: ["run-1", "run-2"],
      moved: false,
      reason: "already_last",
    });
    expect(reorderWorkflowQueueIds(["run-1", "run-2"], "run-3", "MOVE_UP")).toEqual({
      ids: ["run-1", "run-2"],
      moved: false,
      reason: "not_queued",
    });
  });

  it("hides active or queued runs that are no longer live", () => {
    expect(
      filterVisibleWorkflowQueueSnapshot(
        { activeRunId: "run-1", queuedRunIds: ["run-2", "run-3"] },
        ["run-2"],
      ),
    ).toEqual({
      activeRunId: null,
      queuedRunIds: ["run-2"],
    });
  });
});
