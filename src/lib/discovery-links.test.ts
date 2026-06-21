import { describe, expect, it } from "vitest";

import { discoveryCandidateHref, discoveryMissionHref } from "./discovery-links";

describe("discovery deep links", () => {
  it("links to a specific discovery mission", () => {
    expect(discoveryMissionHref("mission 1")).toBe("/discover?mission=mission%201");
  });

  it("links to a candidate inside a specific mission", () => {
    expect(discoveryCandidateHref("mission 1", "candidate 2")).toBe(
      "/discover?mission=mission%201#candidate-candidate%202",
    );
  });

  it("falls back to discovery when no mission is available", () => {
    expect(discoveryMissionHref(null)).toBe("/discover");
    expect(discoveryCandidateHref(null, "candidate 2")).toBe("/discover");
  });
});
