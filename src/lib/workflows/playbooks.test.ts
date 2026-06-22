import { describe, expect, it } from "vitest";

import {
  workflowRunSummary,
  type CandidateHarvestResult,
  type DailySweepResult,
  type OperatingDayResult,
  type PipelineRescueResult,
} from "./playbooks";

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

  it("summarizes operating day results", () => {
    const dailySweep: DailySweepResult = {
      playbook: "daily-sweep",
      workspace: "DK",
      ranAt: "2026-06-22T00:00:00.000Z",
      durationMs: 1200,
      sources: {
        ran: 2,
        succeeded: 2,
        failed: 0,
        skipped: 0,
        found: 5,
        created: 4,
        updated: 1,
        errors: [],
        results: [],
      },
      reminders: { created: 2, emailed: 0, provider: "none" },
      digest: { created: 1, emailed: 0, provider: "none" },
      log: [],
    };
    const candidateHarvest: CandidateHarvestResult = {
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
    const pipelineRescue: PipelineRescueResult = {
      playbook: "pipeline-rescue",
      workspace: "DK",
      ranAt: "2026-06-22T00:00:00.000Z",
      durationMs: 1200,
      staleDeals: { reviewed: 3, tasksCreated: 2 },
      deadlines: { reviewed: 2, tasksCreated: 1 },
      nextActionsUpdated: 4,
      skippedExistingTasks: 1,
      taskIds: ["task-4", "task-5", "task-6"],
      log: [],
    };
    const result: OperatingDayResult = {
      playbook: "operating-day",
      workspace: "DK",
      ranAt: "2026-06-22T00:00:00.000Z",
      durationMs: 3300,
      phases: { dailySweep: true, candidateHarvest: true, pipelineRescue: true },
      dailySweep,
      candidateHarvest,
      pipelineRescue,
      dealIds: candidateHarvest.dealIds,
      taskIds: [...candidateHarvest.taskIds, ...pipelineRescue.taskIds],
      log: [],
    };

    expect(workflowRunSummary(result)).toBe("4 new from sources, 3 candidates saved, 3 rescue tasks created.");
  });

  it("summarizes operating day results with skipped phases", () => {
    const result: OperatingDayResult = {
      playbook: "operating-day",
      workspace: "DK",
      ranAt: "2026-06-22T00:00:00.000Z",
      durationMs: 3300,
      phases: { dailySweep: false, candidateHarvest: false, pipelineRescue: false },
      dealIds: [],
      taskIds: [],
      log: [],
    };

    expect(workflowRunSummary(result)).toBe("0 new from sources, 0 candidates saved, 0 rescue tasks created.");
  });
});
