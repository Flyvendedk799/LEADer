import { describe, expect, it } from "vitest";

import { discoveryMissionDisplayWarnings, discoveryMissionProviderLabel } from "./discovery-display";

describe("discovery display helpers", () => {
  it("labels focused official tender missions as udbud.dk instead of none", () => {
    expect(
      discoveryMissionProviderLabel({
        provider: "none",
        lane: { slug: "tenders-procurement" },
        log: ["2026-06-22T22:16:14.112Z udbud.dk returned 4 active tender candidates in 33s."],
      }),
    ).toBe("udbud.dk");
  });

  it("keeps explicit generic search providers", () => {
    expect(
      discoveryMissionProviderLabel({
        provider: "brave",
        lane: { slug: "tenders-procurement" },
        log: ["2026-06-22T22:16:14.112Z udbud.dk returned 4 active tender candidates in 33s."],
      }),
    ).toBe("brave");
  });

  it("hides generic search-key warnings for official-only tender missions", () => {
    expect(
      discoveryMissionDisplayWarnings(
        {
          provider: "none",
          lane: { slug: "tenders-procurement" },
          log: ["2026-06-22T22:16:14.112Z udbud.dk returned 4 active tender candidates in 33s."],
        },
        [
          "No web search API key configured. Add Tavily, Brave Search, or Serper in Settings -> AI to enable broad web discovery.",
          "2 stale or off-lane candidates hidden from this mission: 2 broad framework agreement.",
        ],
      ),
    ).toEqual(["2 stale or off-lane candidates hidden from this mission: 2 broad framework agreement."]);
  });
});
