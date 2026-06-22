import { describe, expect, it } from "vitest";

import { taskPatchActionSchema, taskPatchData, taskPatchEmptyMessage, taskPatchWhere } from "./actions";

describe("task actions", () => {
  it("keeps single-task handling owner scoped", () => {
    const parsed = taskPatchActionSchema.parse({ id: "task-1", status: "DONE" });

    expect(taskPatchWhere("owner-1", parsed)).toEqual({ ownerId: "owner-1", id: "task-1" });
    expect(taskPatchEmptyMessage(parsed)).toBe("Task not found");
  });

  it("deduplicates explicit task batches for the current owner", () => {
    const parsed = taskPatchActionSchema.parse({
      ids: ["task-1", "task-1", "task-2"],
      dueAt: "2026-06-23T07:00:00.000Z",
      status: "OPEN",
    });

    expect(taskPatchWhere("owner-1", parsed)).toEqual({
      ownerId: "owner-1",
      id: { in: ["task-1", "task-2"] },
    });
    expect(taskPatchEmptyMessage(parsed)).toBe("No matching tasks to update");
  });

  it("sets completedAt when tasks are completed", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    const parsed = taskPatchActionSchema.parse({ ids: ["task-1"], status: "DONE" });

    expect(taskPatchData(parsed, now)).toEqual({
      status: "DONE",
      completedAt: now,
    });
  });

  it("rejects empty task updates", () => {
    expect(() => taskPatchActionSchema.parse({ id: "task-1" })).toThrow();
    expect(() => taskPatchActionSchema.parse({ ids: ["task-1"] })).toThrow();
  });
});
