import { describe, expect, it } from "vitest";

import {
  contactResearchReason,
  countReachablePeople,
  findActiveResearchBriefRun,
  needsContactResearch,
  personHasContactRoute,
  researchBriefIdentityFromInput,
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

  it("extracts linked research brief identity from workflow input", () => {
    expect(
      researchBriefIdentityFromInput({
        playbook: "research-brief",
        workspace: "DK",
        options: {
          researchBrief: {
            subject: "Acme",
            subjectType: "company",
            objective: "map-opportunity",
            accountId: "account-1",
            dealId: "deal-1",
          },
        },
      }),
    ).toEqual({
      accountId: "account-1",
      personId: null,
      dealId: "deal-1",
      subject: "Acme",
      subjectType: "company",
      objective: "map-opportunity",
      workspace: "DK",
    });
  });

  it("finds active linked research briefs by deal, person, or account", () => {
    const runs = [
      {
        id: "run-account",
        status: "QUEUED",
        input: { options: { researchBrief: { accountId: "account-1" } } },
      },
      {
        id: "run-deal",
        status: "RUNNING",
        input: { options: { researchBrief: { accountId: "account-2", dealId: "deal-2" } } },
      },
    ];

    expect(findActiveResearchBriefRun(runs, { accountId: "account-1" })?.id).toBe("run-account");
    expect(findActiveResearchBriefRun(runs, { accountId: "account-2", dealId: "deal-2" })?.id).toBe("run-deal");
    expect(findActiveResearchBriefRun(runs, { accountId: "missing" })).toBeNull();
    expect(findActiveResearchBriefRun(runs, {})).toBeNull();
  });

  it("finds active freeform research briefs by normalized subject and mode", () => {
    const runs = [
      {
        id: "run-contact",
        status: "QUEUED",
        input: {
          playbook: "research-brief",
          workspace: "DK",
          options: {
            researchBrief: {
              subject: "  Mette   Jensen ",
              subjectType: "person",
              objective: "find-contact",
            },
          },
        },
      },
      {
        id: "run-opportunity",
        status: "QUEUED",
        input: {
          playbook: "research-brief",
          workspace: "DK",
          options: {
            researchBrief: {
              subject: "Mette Jensen",
              subjectType: "person",
              objective: "map-opportunity",
            },
          },
        },
      },
    ];

    expect(
      findActiveResearchBriefRun(runs, {
        subject: "mette jensen",
        subjectType: "person",
        objective: "find-contact",
        workspace: "DK",
      })?.id,
    ).toBe("run-contact");
    expect(
      findActiveResearchBriefRun(runs, {
        subject: "Mette Jensen",
        subjectType: "person",
        objective: "verify-identity",
        workspace: "DK",
      }),
    ).toBeNull();
    expect(
      findActiveResearchBriefRun(runs, {
        subject: "Mette Jensen",
        subjectType: "person",
        objective: "find-contact",
        workspace: "GLOBAL",
      }),
    ).toBeNull();
  });

  it("dedupes active research briefs by email, phone, and domain pivots", () => {
    const runs = [
      {
        id: "run-email",
        status: "QUEUED",
        input: {
          playbook: "research-brief",
          workspace: "DK",
          options: { researchBrief: { subject: "Mette Jensen <mette.jensen@northwind.dk>", objective: "find-contact" } },
        },
      },
      {
        id: "run-domain",
        status: "QUEUED",
        input: {
          playbook: "research-brief",
          workspace: "DK",
          options: { researchBrief: { subject: "https://www.northwind.dk/contact", objective: "qualify-lead" } },
        },
      },
      {
        id: "run-phone",
        status: "QUEUED",
        input: {
          playbook: "research-brief",
          workspace: "DK",
          options: { researchBrief: { subject: "+45 12 34 56 78", objective: "find-contact" } },
        },
      },
    ];

    expect(
      findActiveResearchBriefRun(runs, {
        subject: "mette.jensen@northwind.dk",
        objective: "find-contact",
        workspace: "DK",
      })?.id,
    ).toBe("run-email");
    expect(
      findActiveResearchBriefRun(runs, {
        subject: "northwind.dk",
        objective: "qualify-lead",
        workspace: "DK",
      })?.id,
    ).toBe("run-domain");
    expect(
      findActiveResearchBriefRun(runs, {
        subject: "12 34 56 78",
        objective: "find-contact",
        workspace: "DK",
      })?.id,
    ).toBe("run-phone");
  });
});
