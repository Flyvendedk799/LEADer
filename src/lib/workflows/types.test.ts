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

  it("accepts research brief runs with a subject", () => {
    const parsed = workflowRunInputSchema.parse({
      playbook: "research-brief",
      workspace: "DK",
      options: {
        researchBrief: {
          subject: "Aarhus Kommune",
          subjectType: "company",
          objective: "map-opportunity",
          depth: "deep",
          candidateId: "candidate-1",
          createTasks: true,
        },
      },
    });

    expect(parsed.options?.researchBrief?.objective).toBe("map-opportunity");
    expect(parsed.options?.researchBrief?.subject).toBe("Aarhus Kommune");
    expect(parsed.options?.researchBrief?.candidateId).toBe("candidate-1");
  });

  it("rejects research brief runs without a subject", () => {
    const parsed = workflowRunInputSchema.safeParse({
      playbook: "research-brief",
      workspace: "DK",
      options: {},
    });

    expect(parsed.success).toBe(false);
  });
});
