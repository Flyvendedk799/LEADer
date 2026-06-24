import { describe, expect, it } from "vitest";

import { workflowRunCanRerun, workflowRunInputMatchesActiveRun, workflowRunRerunBlockedMessage } from "./run-actions";

describe("workflow run actions", () => {
  it("only allows finished workflow runs to be rerun", () => {
    expect(workflowRunCanRerun("QUEUED")).toBe(false);
    expect(workflowRunCanRerun("RUNNING")).toBe(false);
    expect(workflowRunCanRerun("SUCCESS")).toBe(true);
    expect(workflowRunCanRerun("ERROR")).toBe(true);
    expect(workflowRunCanRerun("CANCELED")).toBe(true);
  });

  it("explains why live workflow runs cannot be rerun", () => {
    expect(workflowRunRerunBlockedMessage("RUNNING")).toBe("Wait for this workflow run to finish before rerunning it.");
    expect(workflowRunRerunBlockedMessage("SUCCESS")).toBeNull();
  });

  it("matches active operational runs by effective default options", () => {
    expect(
      workflowRunInputMatchesActiveRun(
        { playbook: "candidate-harvest", workspace: "DK", options: undefined },
        {
          playbook: "candidate-harvest",
          workspace: "DK",
          input: {
            playbook: "candidate-harvest",
            workspace: "DK",
            options: { candidateHarvest: { minScore: 70, limit: 5 } },
          },
        },
      ),
    ).toBe(true);

    expect(
      workflowRunInputMatchesActiveRun(
        { playbook: "daily-sweep", workspace: "DK", options: { dailySweep: { includeSources: true } } },
        {
          playbook: "daily-sweep",
          workspace: "DK",
          input: { playbook: "daily-sweep", workspace: "DK", options: undefined },
        },
      ),
    ).toBe(true);
  });

  it("does not match active operational runs with different workspaces or effective options", () => {
    expect(
      workflowRunInputMatchesActiveRun(
        { playbook: "pipeline-rescue", workspace: "DK", options: { pipelineRescue: { staleDays: 30 } } },
        {
          playbook: "pipeline-rescue",
          workspace: "DK",
          input: { playbook: "pipeline-rescue", workspace: "DK", options: { pipelineRescue: { staleDays: 14 } } },
        },
      ),
    ).toBe(false);

    expect(
      workflowRunInputMatchesActiveRun(
        { playbook: "candidate-harvest", workspace: "GLOBAL", options: undefined },
        {
          playbook: "candidate-harvest",
          workspace: "DK",
          input: { playbook: "candidate-harvest", workspace: "DK", options: undefined },
        },
      ),
    ).toBe(false);
  });

  it("ignores options for disabled operating day phases", () => {
    expect(
      workflowRunInputMatchesActiveRun(
        {
          playbook: "operating-day",
          workspace: "DK",
          options: {
            operatingDay: { dailySweep: true, candidateHarvest: false, pipelineRescue: true },
            candidateHarvest: { minScore: 90, limit: 1 },
            pipelineRescue: { staleDays: 10 },
          },
        },
        {
          playbook: "operating-day",
          workspace: "DK",
          input: {
            playbook: "operating-day",
            workspace: "DK",
            options: {
              operatingDay: { dailySweep: true, candidateHarvest: false, pipelineRescue: true },
              candidateHarvest: { minScore: 70, limit: 5 },
              pipelineRescue: { staleDays: 10, deadlineDays: 7, limit: 12 },
            },
          },
        },
      ),
    ).toBe(true);
  });
});
