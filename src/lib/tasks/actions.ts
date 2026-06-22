import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { taskCreateSchema, zTaskPriority, zTaskStatus } from "@/lib/validators";

const singleTaskPatchSchema = taskCreateSchema
  .partial()
  .extend({ id: z.string().min(1) })
  .refine((action) => Object.keys(action).some((key) => key !== "id"), {
    message: "Provide at least one task field to update",
  });

const bulkTaskPatchSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(100),
    dueAt: z.coerce.date().optional(),
    priority: zTaskPriority.optional(),
    status: zTaskStatus.optional(),
  })
  .refine((action) => action.dueAt !== undefined || action.priority !== undefined || action.status !== undefined, {
    message: "Provide at least one task field to update",
  });

export const taskPatchActionSchema = z.union([singleTaskPatchSchema, bulkTaskPatchSchema]);

export type TaskPatchAction = z.infer<typeof taskPatchActionSchema>;

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

export function taskPatchWhere(ownerId: string, action: TaskPatchAction): Prisma.TaskWhereInput {
  if ("ids" in action) return { ownerId, id: { in: uniqueIds(action.ids) } };
  return { ownerId, id: action.id };
}

export function taskPatchData(action: TaskPatchAction, now = new Date()): Prisma.TaskUpdateManyMutationInput {
  const { id: _id, ids: _ids, ...data } = action as TaskPatchAction & { id?: string; ids?: string[] };

  return {
    ...data,
    completedAt: data.status === "DONE" ? now : undefined,
  };
}

export function taskPatchEmptyMessage(action: TaskPatchAction) {
  return "ids" in action ? "No matching tasks to update" : "Task not found";
}
