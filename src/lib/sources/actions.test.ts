import { describe, expect, it } from "vitest";

import {
  sourceIsDueForWorkflowAction,
  sourceWorkflowActionLabel,
  sourceWorkflowActionSchema,
  sourceWorkflowActionTargets,
  sourceWorkflowActionWhere,
} from "./actions";

describe("source workflow actions", () => {
  it("keeps source workflow actions owner scoped and deduplicated", () => {
    const parsed = sourceWorkflowActionSchema.parse({
      ids: ["source-1", "source-1", "source-2"],
      action: "DISABLE",
    });

    expect(sourceWorkflowActionWhere("owner-1", parsed)).toEqual({
      ownerId: "owner-1",
      enabled: true,
      id: { in: ["source-1", "source-2"] },
    });
  });

  it("detects due automatable sources", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");

    expect(
      sourceIsDueForWorkflowAction(
        {
          id: "source-1",
          type: "RSS",
          frequency: "DAILY",
          lastCheckedAt: new Date("2026-06-20T10:00:00.000Z"),
        },
        now,
      ),
    ).toBe(true);
    expect(
      sourceIsDueForWorkflowAction(
        {
          id: "source-2",
          type: "RSS",
          frequency: "DAILY",
          lastCheckedAt: new Date("2026-06-22T09:30:00.000Z"),
        },
        now,
      ),
    ).toBe(false);
    expect(
      sourceIsDueForWorkflowAction(
        {
          id: "source-3",
          type: "FACEBOOK_MANUAL",
          frequency: "DAILY",
          lastCheckedAt: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it("targets only due sources when skipping a cycle", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    const targets = sourceWorkflowActionTargets(
      [
        { id: "source-1", type: "RSS", frequency: "DAILY", lastCheckedAt: null },
        { id: "source-2", type: "RSS", frequency: "DAILY", lastCheckedAt: now },
        { id: "source-3", type: "MANUAL", frequency: "MANUAL", lastCheckedAt: null },
      ],
      "SKIP_DUE",
      now,
    );

    expect(targets.map((source) => source.id)).toEqual(["source-1"]);
    expect(sourceWorkflowActionLabel("SKIP_DUE")).toBe("Due sources skipped");
  });
});
