import { describe, expect, it } from "vitest";

import {
  defaultWorkflowPresets,
  workflowPresetFormSchema,
  workflowPresetOptionSummary,
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
});
