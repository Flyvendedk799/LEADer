import { describe, expect, it } from "vitest";

import { workflowResearchLinkedTargets } from "./linked-context";

describe("workflow linked context", () => {
  it("builds navigable targets for linked research context", () => {
    expect(
      workflowResearchLinkedTargets({
        accountId: "account-1",
        accountName: "Kommune Nord",
        personId: "person-1",
        personName: "Dennis Hansen",
        dealId: "deal-1",
        dealTitle: "Intranet",
      }),
    ).toEqual([
      {
        kind: "deal",
        label: "Intranet",
        href: "/deals/deal-1",
        detail: "Kommune Nord",
      },
      {
        kind: "account",
        label: "Kommune Nord",
        href: "/accounts/account-1",
        detail: "Intranet",
      },
      {
        kind: "person",
        label: "Dennis Hansen",
        href: "/accounts/account-1",
        detail: "Kommune Nord",
      },
    ]);
  });

  it("keeps partial linked context visible even without a route", () => {
    expect(
      workflowResearchLinkedTargets({
        personName: "Mette Jensen",
        dealTitle: "Unlinked tender",
      }),
    ).toEqual([
      {
        kind: "deal",
        label: "Unlinked tender",
        detail: undefined,
        href: undefined,
      },
      {
        kind: "person",
        label: "Mette Jensen",
        detail: "Unlinked tender",
        href: undefined,
      },
    ]);
    expect(workflowResearchLinkedTargets(null)).toEqual([]);
  });
});
