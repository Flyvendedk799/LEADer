import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const alertPatchSchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);

export type AlertPatchAction = z.infer<typeof alertPatchSchema>;

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

export function alertPatchWhere(ownerId: string, action: AlertPatchAction): Prisma.AlertWhereInput {
  if ("all" in action) return { ownerId, read: false };
  if ("ids" in action) return { ownerId, id: { in: uniqueIds(action.ids) } };
  return { ownerId, id: action.id };
}

export function alertPatchEmptyMessage(action: AlertPatchAction) {
  return "all" in action ? "No unread alerts to handle" : "Alert not found";
}
