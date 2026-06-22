import { describe, expect, it } from "vitest";

import { workflowRunSummary, type PipelineRescueResult } from "./playbooks";

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
});
