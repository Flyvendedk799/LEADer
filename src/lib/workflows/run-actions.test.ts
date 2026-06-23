import { describe, expect, it } from "vitest";

import { workflowRunCanRerun, workflowRunRerunBlockedMessage } from "./run-actions";

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
});
