import { describe, expect, it } from "vitest";

import { discoveryMissionCanRerun, discoveryMissionRerunBlockedMessage } from "./discovery-run-actions";

describe("discovery run actions", () => {
  it("only allows finished discovery missions to be rerun", () => {
    expect(discoveryMissionCanRerun("QUEUED")).toBe(false);
    expect(discoveryMissionCanRerun("RUNNING")).toBe(false);
    expect(discoveryMissionCanRerun("SUCCESS")).toBe(true);
    expect(discoveryMissionCanRerun("ERROR")).toBe(true);
    expect(discoveryMissionCanRerun("CANCELED")).toBe(true);
  });

  it("explains why live discovery missions cannot be rerun", () => {
    expect(discoveryMissionRerunBlockedMessage("RUNNING")).toBe("Wait for this discovery mission to finish before rerunning it.");
    expect(discoveryMissionRerunBlockedMessage("SUCCESS")).toBeNull();
  });
});
