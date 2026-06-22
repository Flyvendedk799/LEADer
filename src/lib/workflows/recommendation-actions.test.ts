import { describe, expect, it } from "vitest";

import {
  workflowRecommendationBatchToast,
  workflowRecommendationPresetPayload,
  workflowRecommendationRunPayload,
} from "./recommendation-actions";

describe("workflow recommendation actions", () => {
  it("builds queue payloads with Danish workspace as the default", () => {
    expect(
      workflowRecommendationRunPayload({
        title: "Harvest hot candidates",
        reason: "3 candidates need review.",
        playbook: "candidate-harvest",
        options: { candidateHarvest: { minScore: 70, limit: 3 } },
      }),
    ).toEqual({
      playbook: "candidate-harvest",
      workspace: "DK",
      options: { candidateHarvest: { minScore: 70, limit: 3 } },
    });
  });

  it("builds manual preset payloads from recommendations", () => {
    expect(
      workflowRecommendationPresetPayload({
        title: "Rescue pipeline",
        reason: "2 stale deals need next actions.",
        playbook: "pipeline-rescue",
        workspace: "GLOBAL",
        options: { pipelineRescue: { staleDays: 14, deadlineDays: 7, limit: 2 } },
      }),
    ).toEqual({
      name: "Rescue pipeline mode",
      description: "2 stale deals need next actions.",
      playbook: "pipeline-rescue",
      workspace: "GLOBAL",
      pinned: false,
      scheduleEnabled: false,
      scheduleIntervalHours: 24,
      scheduleNextRunAt: null,
      options: { pipelineRescue: { staleDays: 14, deadlineDays: 7, limit: 2 } },
    });
  });

  it("summarizes successful batch recommendation actions", () => {
    expect(workflowRecommendationBatchToast("queue", 3, 0)).toEqual({
      title: "Recommendations queued",
      description: "3 recommended moves queued for background runs",
    });
    expect(workflowRecommendationBatchToast("save", 1, 0)).toEqual({
      title: "Recommendations saved",
      description: "1 recommended move saved as a preset",
    });
  });

  it("summarizes partial and failed batch recommendation actions", () => {
    expect(workflowRecommendationBatchToast("queue", 2, 1)).toEqual({
      title: "Some recommendations failed",
      description: "2 recommended moves queued - 1 failed",
    });
    expect(workflowRecommendationBatchToast("save", 0, 2)).toEqual({
      title: "No recommendations saved",
      description: "2 failed",
    });
  });
});
