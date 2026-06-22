import { describe, expect, it } from "vitest";

import { workflowRunInputSchema } from "./types";

describe("workflowRunInputSchema", () => {
  it("accepts controlled workflow run options", () => {
    const parsed = workflowRunInputSchema.parse({
      playbook: "operating-day",
      workspace: "DK",
      options: {
        operatingDay: { dailySweep: true, candidateHarvest: false, pipelineRescue: true },
        candidateHarvest: { minScore: "82", limit: "3" },
        pipelineRescue: { staleDays: "10", deadlineDays: "5", limit: "8" },
        dailySweep: { includeSources: false, includeAlerts: true },
      },
    });

    expect(parsed.options?.candidateHarvest?.minScore).toBe(82);
    expect(parsed.options?.pipelineRescue?.limit).toBe(8);
  });

  it("rejects operating day runs with every phase disabled", () => {
    const parsed = workflowRunInputSchema.safeParse({
      playbook: "operating-day",
      workspace: "DK",
      options: {
        operatingDay: { dailySweep: false, candidateHarvest: false, pipelineRescue: false },
      },
    });

    expect(parsed.success).toBe(false);
  });
});
