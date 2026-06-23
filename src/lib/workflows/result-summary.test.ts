import { describe, expect, it } from "vitest";

import { workflowRunResultSummary } from "./result-summary";

describe("workflowRunResultSummary", () => {
  it("summarizes operating-day JSON results", () => {
    expect(
      workflowRunResultSummary("operating-day", {
        dailySweep: {
          sources: { created: 2 },
        },
        candidateHarvest: {
          candidates: { saved: 3 },
        },
        pipelineRescue: {
          staleDeals: { tasksCreated: 1 },
          deadlines: { tasksCreated: 2 },
        },
      }),
    ).toBe("2 source leads - 3 saved deals - 3 rescue tasks");
  });

  it("returns null before a run has a result", () => {
    expect(workflowRunResultSummary("daily-sweep", null)).toBeNull();
  });

  it("summarizes research brief JSON results", () => {
    expect(
      workflowRunResultSummary("research-brief", {
        subject: "Aarhus Kommune",
        createdTasks: 6,
        skippedExistingTasks: 2,
      }),
    ).toBe("6 research tasks - 2 existing - Aarhus Kommune");
  });

  it("surfaces worksheet sections for completed research briefs", () => {
    expect(
      workflowRunResultSummary("research-brief", {
        subject: "Mette Jensen",
        createdTasks: 0,
        skippedExistingTasks: 0,
        worksheet: [{ id: "identity" }, { id: "contact-route" }],
      }),
    ).toBe("2 worksheet sections - 0 research tasks - 0 existing - Mette Jensen");
  });
});
