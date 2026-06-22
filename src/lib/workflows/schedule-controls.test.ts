import { describe, expect, it } from "vitest";

import { workflowPresetScheduleControlPayload } from "./schedule-controls";

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
});
