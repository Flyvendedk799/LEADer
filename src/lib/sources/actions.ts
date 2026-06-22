import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { isSourceDue } from "@/lib/ingestion";
import { AUTOMATABLE_SOURCE_TYPES, type MonitorFrequency, type SourceType } from "@/lib/types";

export const sourceWorkflowActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["SKIP_DUE", "DISABLE"]),
});

export type SourceWorkflowAction = z.infer<typeof sourceWorkflowActionSchema>;

export type SourceWorkflowActionSource = {
  id: string;
  type: SourceType;
  frequency: MonitorFrequency;
  lastCheckedAt: Date | null;
};

export function sourceWorkflowActionIds(action: SourceWorkflowAction) {
  return Array.from(new Set(action.ids));
}

export function sourceWorkflowActionWhere(ownerId: string, action: SourceWorkflowAction): Prisma.SourceWhereInput {
  return {
    ownerId,
    enabled: true,
    id: { in: sourceWorkflowActionIds(action) },
  };
}

export function sourceIsAutomatable(source: Pick<SourceWorkflowActionSource, "type">) {
  return AUTOMATABLE_SOURCE_TYPES.includes(source.type);
}

export function sourceIsDueForWorkflowAction(source: SourceWorkflowActionSource, now = new Date()) {
  return sourceIsAutomatable(source) && isSourceDue(source, now);
}

export function sourceWorkflowActionTargets(
  sources: SourceWorkflowActionSource[],
  action: SourceWorkflowAction["action"],
  now = new Date(),
) {
  if (action === "DISABLE") return sources;
  return sources.filter((source) => sourceIsDueForWorkflowAction(source, now));
}

export function sourceWorkflowActionLabel(action: SourceWorkflowAction["action"]) {
  return action === "DISABLE" ? "Sources disabled" : "Due sources skipped";
}
