import { describe, expect, it } from "vitest";

import { scheduledPresetOverlapSkipResult } from "./preset-runs";

describe("scheduled workflow preset runs", () => {
  it("reports skipped scheduled presets when an active run already exists", () => {
    expect(
      scheduledPresetOverlapSkipResult(
        { id: "preset-1", name: "Morning sweep" },
        { id: "run-1", status: "RUNNING" },
      ),
    ).toEqual({
      presetId: "preset-1",
      presetName: "Morning sweep",
      status: "SKIPPED",
      skipReason: "already_running",
      activeRunId: "run-1",
      activeRunStatus: "RUNNING",
    });
  });
});
