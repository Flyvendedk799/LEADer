import { describe, expect, it } from "vitest";

import {
  dealWorkflowActionSchema,
  dealWorkflowActionWhere,
  dealWorkflowEmptyMessage,
  dealWorkflowNextAction,
  dealWorkflowTaskKey,
  dealWorkflowTaskPlan,
} from "./deal-workflow-actions";

describe("deal workflow actions", () => {
  it("builds owner-scoped open-deal filters", () => {
    const parsed = dealWorkflowActionSchema.parse({
      ids: ["deal-1", "deal-1", "deal-2"],
      action: "revive",
    });

    expect(dealWorkflowActionWhere("owner-1", parsed)).toEqual({
      ownerId: "owner-1",
      id: { in: ["deal-1", "deal-2"] },
      status: {
        in: ["DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION"],
      },
    });
    expect(dealWorkflowEmptyMessage(parsed)).toBe("No open deals to revive");
  });

  it("plans stale-deal follow-up tasks for tomorrow", () => {
    const plan = dealWorkflowTaskPlan(
      { id: "deal-1", accountId: "account-1", title: "AI automation", deadline: null },
      "revive",
      new Date("2026-06-22T10:00:00.000Z"),
    );

    expect(plan).toEqual({
      dealId: "deal-1",
      accountId: "account-1",
      title: "Follow up: AI automation",
      dueAt: new Date("2026-06-23T07:00:00.000Z"),
      priority: "HIGH",
      nextAction: dealWorkflowNextAction("revive"),
    });
  });

  it("plans deadline prep before the deadline when possible", () => {
    const plan = dealWorkflowTaskPlan(
      {
        id: "deal-2",
        accountId: null,
        title: "Tender response",
        deadline: new Date("2026-06-25T12:00:00.000Z"),
      },
      "prep",
      new Date("2026-06-22T10:00:00.000Z"),
    );

    expect(plan.dueAt).toEqual(new Date("2026-06-24T07:00:00.000Z"));
    expect(plan.priority).toBe("URGENT");
    expect(plan.nextAction).toBe(dealWorkflowNextAction("prep"));
  });

  it("falls deadline prep back to tomorrow when the prep window has passed", () => {
    const plan = dealWorkflowTaskPlan(
      {
        id: "deal-3",
        accountId: null,
        title: "Urgent tender",
        deadline: new Date("2026-06-22T12:00:00.000Z"),
      },
      "prep",
      new Date("2026-06-22T10:00:00.000Z"),
    );

    expect(plan.dueAt).toEqual(new Date("2026-06-23T07:00:00.000Z"));
    expect(dealWorkflowTaskKey(plan)).toBe("deal-3:Prepare submission: Urgent tender");
  });
});
