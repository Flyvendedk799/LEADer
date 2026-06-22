import { describe, expect, it } from "vitest";

import {
  workflowPresetBulkScheduleLabel,
  workflowPresetBulkSchedulePayload,
  workflowPresetBulkScheduleReason,
  workflowPresetBulkScheduleWhere,
  workflowPresetScheduleControlPayload,
} from "./schedule-controls";

describe("workflow preset schedule controls", () => {
  it("builds pause and resume payloads without changing the saved next run", () => {
    const nextRun = "2026-06-22T12:00:00.000Z";

    expect(
      workflowPresetScheduleControlPayload({ scheduleIntervalHours: 6, scheduleNextRunAt: nextRun }, "PAUSE"),
    ).toEqual({ scheduleEnabled: false });
    expect(
      workflowPresetScheduleControlPayload({ scheduleIntervalHours: 6, scheduleNextRunAt: nextRun }, "RESUME"),
    ).toEqual({ scheduleEnabled: true, scheduleNextRunAt: nextRun });
  });

  it("snoozes and skips from the command time", () => {
    const now = new Date("2026-06-22T08:00:00.000Z");

    expect(workflowPresetScheduleControlPayload({ scheduleIntervalHours: 6 }, "SNOOZE_1H", now)).toEqual({
      scheduleEnabled: true,
      scheduleNextRunAt: "2026-06-22T09:00:00.000Z",
    });
    expect(workflowPresetScheduleControlPayload({ scheduleIntervalHours: 6 }, "SNOOZE_24H", now)).toEqual({
      scheduleEnabled: true,
      scheduleNextRunAt: "2026-06-23T08:00:00.000Z",
    });
    expect(workflowPresetScheduleControlPayload({ scheduleIntervalHours: 6 }, "SKIP_ONCE", now)).toEqual({
      scheduleEnabled: true,
      scheduleNextRunAt: "2026-06-22T14:00:00.000Z",
    });
  });

  it("clamps skip intervals to the allowed preset cadence range", () => {
    const now = new Date("2026-06-22T08:00:00.000Z");

    expect(workflowPresetScheduleControlPayload({ scheduleIntervalHours: 0 }, "SKIP_ONCE", now)).toEqual({
      scheduleEnabled: true,
      scheduleNextRunAt: "2026-06-22T09:00:00.000Z",
    });
    expect(workflowPresetScheduleControlPayload({ scheduleIntervalHours: 900 }, "SKIP_ONCE", now)).toEqual({
      scheduleEnabled: true,
      scheduleNextRunAt: "2026-07-22T08:00:00.000Z",
    });
  });

  it("scopes bulk schedule controls by owner and intent", () => {
    expect(workflowPresetBulkScheduleWhere("owner-1", "PAUSE_ALL")).toEqual({
      ownerId: "owner-1",
      scheduleEnabled: true,
    });
    expect(workflowPresetBulkScheduleWhere("owner-1", "RESUME_PINNED")).toEqual({
      ownerId: "owner-1",
      pinned: true,
    });
  });

  it("builds bulk schedule payloads and labels", () => {
    const now = new Date("2026-06-22T08:00:00.000Z");
    const preset = {
      id: "preset-1",
      pinned: true,
      scheduleEnabled: true,
      scheduleIntervalHours: 6,
      scheduleNextRunAt: new Date("2026-06-22T12:00:00.000Z"),
    };

    expect(workflowPresetBulkSchedulePayload(preset, "PAUSE_ALL", now)).toEqual({ scheduleEnabled: false });
    expect(workflowPresetBulkSchedulePayload(preset, "SNOOZE_ALL_24H", now)).toEqual({
      scheduleEnabled: true,
      scheduleNextRunAt: "2026-06-23T08:00:00.000Z",
    });
    expect(workflowPresetBulkScheduleLabel("RESUME_PINNED")).toBe("Resume pinned schedules");
    expect(workflowPresetBulkScheduleReason("SNOOZE_ALL_1H")).toBe("snooze_all_1h");
  });
});
