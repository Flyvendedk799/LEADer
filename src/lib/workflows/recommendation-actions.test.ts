import { describe, expect, it } from "vitest";

import {
  filterWorkflowRecommendationBatch,
  filterWorkflowRecommendations,
  workflowRecommendationBatchToast,
  workflowRecommendationBlockedByActiveRun,
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
    expect(workflowRecommendationBatchToast("queue", 1, 0, 2)).toEqual({
      title: "Recommendations queued",
      description: "1 recommended move queued for background runs - 2 overlapping skipped",
    });
  });

  it("hides recommendations that are already queued or running", () => {
    const recommendations = [
      {
        title: "Harvest hot candidates",
        reason: "3 candidates need review.",
        playbook: "candidate-harvest",
        options: { candidateHarvest: { minScore: 70, limit: 3 } },
      },
      {
        title: "Rescue pipeline",
        reason: "2 stale deals need next actions.",
        playbook: "pipeline-rescue",
        options: { pipelineRescue: { staleDays: 14, deadlineDays: 7, limit: 2 } },
      },
    ];

    expect(
      filterWorkflowRecommendations(recommendations, [
        {
          playbook: "candidate-harvest",
          workspace: "DK",
          status: "QUEUED",
          finishedAt: null,
        },
      ]).map((item) => item.playbook),
    ).toEqual(["pipeline-rescue"]);
    expect(
      filterWorkflowRecommendations(recommendations, [
        {
          playbook: "candidate-harvest",
          workspace: "GLOBAL",
          status: "QUEUED",
          finishedAt: null,
        },
      ]).map((item) => item.playbook),
    ).toEqual(["candidate-harvest", "pipeline-rescue"]);
  });

  it("treats an active operating-day phase as covering sub-playbook recommendations", () => {
    const operatingDay = {
      playbook: "operating-day",
      workspace: "DK",
      status: "RUNNING",
      finishedAt: null,
      input: {
        playbook: "operating-day",
        workspace: "DK",
        options: {
          operatingDay: {
            dailySweep: false,
            candidateHarvest: true,
            pipelineRescue: false,
          },
        },
      },
    };

    expect(
      workflowRecommendationBlockedByActiveRun(
        {
          title: "Harvest hot candidates",
          reason: "3 candidates need review.",
          playbook: "candidate-harvest",
        },
        operatingDay,
      ),
    ).toBe(true);
    expect(
      workflowRecommendationBlockedByActiveRun(
        {
          title: "Sweep due sources",
          reason: "Sources are due.",
          playbook: "daily-sweep",
        },
        operatingDay,
      ),
    ).toBe(false);
  });

  it("dedupes overlapping queue-all recommendations before posting", () => {
    const recommendations = [
      {
        title: "Run operating day",
        reason: "Best next move.",
        playbook: "operating-day",
        options: {
          operatingDay: {
            dailySweep: true,
            candidateHarvest: true,
            pipelineRescue: true,
          },
        },
      },
      {
        title: "Harvest hot candidates",
        reason: "3 candidates need review.",
        playbook: "candidate-harvest",
      },
      {
        title: "Rescue pipeline",
        reason: "2 stale deals need next actions.",
        playbook: "pipeline-rescue",
      },
      {
        title: "Sweep due sources",
        reason: "Sources are due.",
        playbook: "daily-sweep",
      },
    ];

    expect(filterWorkflowRecommendationBatch(recommendations).map((item) => item.playbook)).toEqual(["operating-day"]);
  });

  it("keeps non-overlapping sub-playbooks when operating day disabled their phases", () => {
    const recommendations = [
      {
        title: "Run operating day",
        reason: "Best next move.",
        playbook: "operating-day",
        options: {
          operatingDay: {
            dailySweep: false,
            candidateHarvest: true,
            pipelineRescue: false,
          },
        },
      },
      {
        title: "Rescue pipeline",
        reason: "2 stale deals need next actions.",
        playbook: "pipeline-rescue",
      },
      {
        title: "Harvest hot candidates",
        reason: "3 candidates need review.",
        playbook: "candidate-harvest",
      },
    ];

    expect(filterWorkflowRecommendationBatch(recommendations).map((item) => item.playbook)).toEqual([
      "operating-day",
      "pipeline-rescue",
    ]);
  });
});
