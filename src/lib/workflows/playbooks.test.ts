import { describe, expect, it } from "vitest";

import { workflowRunSummary, type CandidateHarvestResult, type PipelineRescueResult } from "./playbooks";

describe("workflowRunSummary", () => {
  it("summarizes pipeline rescue results", () => {
    const result: PipelineRescueResult = {
      playbook: "pipeline-rescue",
      workspace: "DK",
      ranAt: "2026-06-22T00:00:00.000Z",
      durationMs: 1200,
      staleDeals: { reviewed: 3, tasksCreated: 2 },
      deadlines: { reviewed: 2, tasksCreated: 1 },
      nextActionsUpdated: 4,
      skippedExistingTasks: 1,
      taskIds: ["task-1", "task-2", "task-3"],
      log: [],
    };

    expect(workflowRunSummary(result)).toBe("2 stale follow-up tasks, 1 deadline prep tasks, 4 next actions updated.");
  });

  it("summarizes candidate harvest results", () => {
    const result: CandidateHarvestResult = {
      playbook: "candidate-harvest",
      workspace: "DK",
      ranAt: "2026-06-22T00:00:00.000Z",
      durationMs: 900,
      candidates: { reviewed: 4, saved: 3, alreadyInPipeline: 1, minScore: 70 },
      candidateIds: ["candidate-1", "candidate-2", "candidate-3", "candidate-4"],
      dealIds: ["deal-1", "deal-2", "deal-3"],
      taskIds: ["task-1", "task-2", "task-3"],
      log: [],
    };

    expect(workflowRunSummary(result)).toBe("3 hot candidates saved as deals, 1 already in pipeline.");
  });
});
