import { describe, expect, it } from "vitest";

import {
  filterWorkflowActivityItems,
  workflowActivityKindCounts,
  workflowActivityStatusBucket,
  type WorkflowActivityItem,
} from "./activity-feed";

const items: WorkflowActivityItem[] = [
  {
    id: "workflow-1",
    kind: "workflow",
    title: "Operating day playbook",
    description: "scheduled preset",
    status: "QUEUED",
    href: "/workflows/runs/1",
    createdAt: "2026-06-22T08:00:00.000Z",
  },
  {
    id: "mission-1",
    kind: "mission",
    title: "AI vouchers mission",
    description: "Danish grants",
    status: "SUCCESS",
    href: "/discover?mission=1",
    createdAt: "2026-06-22T09:00:00.000Z",
  },
  {
    id: "source-1",
    kind: "source",
    title: "Source run",
    description: "Parser failed",
    status: "ERROR",
    href: "/sources",
    createdAt: "2026-06-22T10:00:00.000Z",
  },
];

describe("workflow activity feed filters", () => {
  it("buckets activity statuses for operator filters", () => {
    expect(workflowActivityStatusBucket("QUEUED")).toBe("active");
    expect(workflowActivityStatusBucket("ERROR")).toBe("attention");
    expect(workflowActivityStatusBucket("SUCCESS")).toBe("done");
    expect(workflowActivityStatusBucket("CONTROL")).toBe("other");
  });

  it("filters by kind, status, and text query", () => {
    expect(filterWorkflowActivityItems(items, { kind: "workflow" }).map((item) => item.id)).toEqual(["workflow-1"]);
    expect(filterWorkflowActivityItems(items, { status: "attention" }).map((item) => item.id)).toEqual(["source-1"]);
    expect(filterWorkflowActivityItems(items, { query: "danish" }).map((item) => item.id)).toEqual(["mission-1"]);
    expect(filterWorkflowActivityItems(items, { kind: "mission", status: "done", query: "voucher" }).map((item) => item.id)).toEqual([
      "mission-1",
    ]);
  });

  it("counts activity kinds", () => {
    expect(workflowActivityKindCounts(items)).toMatchObject({
      mission: 1,
      workflow: 1,
      source: 1,
      alert: 0,
    });
  });
});
