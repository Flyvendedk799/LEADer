import { describe, expect, it } from "vitest";

import {
  discoveryCandidateHashId,
  discoveryRejectedAnchorKey,
  shouldLoadRejectedDiscoveryAnchor,
} from "./discovery-anchors";

describe("discovery candidate anchors", () => {
  it("extracts candidate anchors from URL hashes", () => {
    expect(discoveryCandidateHashId("#candidate-candidate%202")).toBe("candidate-candidate 2");
    expect(discoveryCandidateHashId("candidate-abc")).toBe("candidate-abc");
    expect(discoveryCandidateHashId("#mission-abc")).toBeNull();
  });

  it("opens rejected results once when a candidate anchor is not visible", () => {
    const key = discoveryRejectedAnchorKey("mission-1", "candidate-1");

    expect(
      shouldLoadRejectedDiscoveryAnchor({
        activeMissionId: "mission-1",
        hashId: "candidate-1",
        rejectedCandidateCount: 2,
        rejectedResultsOpen: false,
        attemptedKey: null,
      }),
    ).toBe(true);
    expect(
      shouldLoadRejectedDiscoveryAnchor({
        activeMissionId: "mission-1",
        hashId: "candidate-1",
        rejectedCandidateCount: 2,
        rejectedResultsOpen: false,
        attemptedKey: key,
      }),
    ).toBe(false);
    expect(
      shouldLoadRejectedDiscoveryAnchor({
        activeMissionId: "mission-1",
        hashId: "candidate-1",
        rejectedCandidateCount: 0,
        rejectedResultsOpen: false,
      }),
    ).toBe(false);
  });
});
