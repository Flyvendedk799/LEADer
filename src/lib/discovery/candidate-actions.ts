import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const discoveryCandidateBulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["review", "save", "dismiss", "duplicate"]),
  reason: z.string().optional(),
});

export type DiscoveryCandidateBulkAction = z.infer<typeof discoveryCandidateBulkActionSchema>;

export function discoveryCandidateBulkIds(action: DiscoveryCandidateBulkAction) {
  return Array.from(new Set(action.ids));
}

export function discoveryCandidateBulkWhere(ownerId: string, action: DiscoveryCandidateBulkAction): Prisma.DiscoveryCandidateWhereInput {
  return { ownerId, id: { in: discoveryCandidateBulkIds(action) } };
}

export function discoveryCandidateBulkStatus(action: DiscoveryCandidateBulkAction) {
  if (action.action === "dismiss") return "DISMISSED";
  if (action.action === "duplicate") return "DUPLICATE";
  if (action.action === "review") return "REVIEWED";
  return null;
}

export function discoveryCandidateBulkUpdateData(action: DiscoveryCandidateBulkAction): Prisma.DiscoveryCandidateUpdateManyMutationInput {
  const status = discoveryCandidateBulkStatus(action);
  if (!status) throw new Error("Bulk save must use saveCandidateAsDeal");
  return {
    status,
    ...(action.reason ? { dismissalReason: action.reason } : {}),
  };
}

export function discoveryCandidateBulkEmptyMessage(action: DiscoveryCandidateBulkAction) {
  return action.action === "save" ? "No matching candidates to save" : "No matching candidates to update";
}
