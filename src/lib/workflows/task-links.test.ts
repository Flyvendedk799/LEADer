import { describe, expect, it } from "vitest";

import { workflowTaskHref } from "./task-links";

describe("workflowTaskHref", () => {
  it("prefers deal links, then account links, then workflows", () => {
    expect(workflowTaskHref({ dealId: "deal-1", accountId: "account-1" })).toBe("/deals/deal-1");
    expect(workflowTaskHref({ accountId: "account-1" })).toBe("/accounts/account-1");
    expect(workflowTaskHref({})).toBe("/workflows");
  });
});
