import { describe, expect, it } from "vitest";

import {
  contactResearchReason,
  countReachablePeople,
  needsContactResearch,
  personHasContactRoute,
} from "./research-targets";

describe("workflow research targets", () => {
  it("treats email, phone, and LinkedIn as reachable contact routes", () => {
    expect(personHasContactRoute({ email: "  " })).toBe(false);
    expect(personHasContactRoute({ email: "buyer@example.com" })).toBe(true);
    expect(personHasContactRoute({ phone: "+45 12 34 56 78" })).toBe(true);
    expect(personHasContactRoute({ linkedin: "https://linkedin.com/in/example" })).toBe(true);
    expect(countReachablePeople([{ email: "" }, { linkedin: "https://linkedin.com/in/example" }])).toBe(1);
  });

  it("only flags accounts with open deal context and no reachable people", () => {
    expect(needsContactResearch({ people: [], openDealCount: 0 })).toBe(false);
    expect(needsContactResearch({ people: [], openDealCount: 1 })).toBe(true);
    expect(needsContactResearch({ people: [{ email: "buyer@example.com" }], openDealCount: 1 })).toBe(false);
  });

  it("explains why an account needs contact research", () => {
    expect(
      contactResearchReason({
        peopleCount: 0,
        reachablePeopleCount: 0,
        openDealCount: 1,
        latestDealTitle: "Intranet",
      }),
    ).toContain("Intranet");
    expect(
      contactResearchReason({
        peopleCount: 2,
        reachablePeopleCount: 0,
        openDealCount: 1,
      }),
    ).toContain("none has email");
  });
});
