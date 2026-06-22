import { describe, expect, it } from "vitest";

import { formatWorkflowElapsed, workflowLogEntry, workflowQueueLogMessage } from "./logging";

describe("workflow logging helpers", () => {
  it("formats playbook elapsed time", () => {
    expect(formatWorkflowElapsed(1500)).toBe("2s");
    expect(formatWorkflowElapsed(181_000)).toBe("3m 01s");
    expect(formatWorkflowElapsed(-100)).toBe("0s");
  });

  it("describes background queue state", () => {
    expect(workflowQueueLogMessage("run-1", { activeRunId: "run-1", queuedRunIds: [] })).toMatch(/keep running/);
    expect(workflowQueueLogMessage("run-2", { activeRunId: "run-1", queuedRunIds: ["run-2"] })).toBe(
      "Background worker queued playbook at position 1; it will run after active playbooks.",
    );
  });

  it("builds timestamped log entries", () => {
    expect(workflowLogEntry("Queued", new Date("2026-06-22T09:00:00.000Z"))).toBe(
      "2026-06-22T09:00:00.000Z Queued",
    );
  });
});
