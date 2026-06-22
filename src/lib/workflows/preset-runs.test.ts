import { describe, expect, it } from "vitest";

import { scheduledPresetOverlapSkipResult, workflowPresetEventMessage } from "./preset-runs";

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

  it("writes clear audit messages for scheduled decisions", () => {
    expect(
      workflowPresetEventMessage({
        presetId: "preset-1",
        presetName: "Morning sweep",
        runId: "run-1",
        nextRunAt: "2026-06-22T12:00:00.000Z",
        status: "QUEUED",
      }),
    ).toBe('Queued scheduled preset "Morning sweep" as run run-1.');

    expect(
      workflowPresetEventMessage({
        presetId: "preset-1",
        presetName: "Morning sweep",
        status: "SKIPPED",
        skipReason: "already_running",
        activeRunId: "run-1",
        activeRunStatus: "RUNNING",
      }),
    ).toBe('Skipped scheduled preset "Morning sweep" because run run-1 is already running.');
  });
});
