import { describe, expect, it } from "vitest";

import {
  defaultWorkflowPresets,
  isWorkflowPresetDue,
  nextWorkflowPresetRunAt,
  workflowPresetFormSchema,
  workflowPresetOptionSummary,
  workflowPresetScheduleSummary,
  workflowPresetUpdateSchema,
} from "./presets";
import { workflowRunInputSchema } from "./types";

describe("workflow presets", () => {
  it("ships valid default presets", () => {
    expect(defaultWorkflowPresets.length).toBeGreaterThan(0);

    for (const preset of defaultWorkflowPresets) {
      expect(
        workflowRunInputSchema.safeParse({
          playbook: preset.playbook,
          workspace: preset.workspace,
          options: preset.options,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects operating day presets with every phase disabled", () => {
    const parsed = workflowPresetFormSchema.safeParse({
      name: "No-op day",
      playbook: "operating-day",
      workspace: "DK",
      options: {
        operatingDay: {
          dailySweep: false,
          candidateHarvest: false,
          pipelineRescue: false,
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects empty update payloads", () => {
    expect(workflowPresetUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("summarizes tuned options", () => {
    expect(
      workflowPresetOptionSummary({
        operatingDay: { dailySweep: true, candidateHarvest: true, pipelineRescue: false },
        candidateHarvest: { minScore: 82, limit: 5 },
        dailySweep: { includeSources: true, includeAlerts: false },
      }),
    ).toBe("sweep + harvest · score 82+ · 5 candidates · alerts off");
  });

  it("calculates schedule due state and next run", () => {
    const now = new Date("2026-06-22T08:00:00.000Z");

    expect(isWorkflowPresetDue({ scheduleEnabled: false, scheduleNextRunAt: null }, now)).toBe(false);
    expect(isWorkflowPresetDue({ scheduleEnabled: true, scheduleNextRunAt: null }, now)).toBe(true);
    expect(isWorkflowPresetDue({ scheduleEnabled: true, scheduleNextRunAt: new Date("2026-06-22T07:59:00.000Z") }, now)).toBe(true);
    expect(isWorkflowPresetDue({ scheduleEnabled: true, scheduleNextRunAt: new Date("2026-06-22T08:01:00.000Z") }, now)).toBe(false);
    expect(nextWorkflowPresetRunAt(now, 6).toISOString()).toBe("2026-06-22T14:00:00.000Z");
  });

  it("summarizes schedules", () => {
    expect(
      workflowPresetScheduleSummary({
        scheduleEnabled: false,
        scheduleIntervalHours: 24,
        scheduleNextRunAt: null,
      }),
    ).toBe("Manual");
    expect(
      workflowPresetScheduleSummary({
        scheduleEnabled: true,
        scheduleIntervalHours: 48,
        scheduleNextRunAt: new Date("2026-06-23T08:00:00.000Z"),
      }),
    ).toBe("Every 2d · next 2026-06-23T08:00:00.000Z");
  });
});
