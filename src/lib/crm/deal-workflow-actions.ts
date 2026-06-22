import type { Prisma } from "@prisma/client";
import { z } from "zod";

import type { DealStatus, TaskPriority } from "@/lib/types";

const OPEN_DEAL_STATUSES: DealStatus[] = [
  "DISCOVERED",
  "QUALIFYING",
  "INTERESTING",
  "CONTACTED",
  "PROPOSAL",
  "NEGOTIATION",
];

export const dealWorkflowActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["revive", "prep"]),
});

export type DealWorkflowAction = z.infer<typeof dealWorkflowActionSchema>;

export type DealWorkflowActionDeal = {
  id: string;
  accountId: string | null;
  title: string;
  deadline: Date | null;
};

export type DealWorkflowTaskPlan = {
  dealId: string;
  accountId: string | null;
  title: string;
  dueAt: Date;
  priority: TaskPriority;
  nextAction: string;
};

function atNine(date: Date) {
  const copy = new Date(date);
  copy.setHours(9, 0, 0, 0);
  return copy;
}

function tomorrowFrom(now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return atNine(tomorrow);
}

function prepDueFrom(deadline: Date | null, now: Date) {
  const tomorrow = tomorrowFrom(now);
  if (!deadline) return tomorrow;
  const beforeDeadline = new Date(deadline);
  beforeDeadline.setDate(beforeDeadline.getDate() - 1);
  const dueAt = atNine(beforeDeadline);
  return dueAt.getTime() > now.getTime() ? dueAt : tomorrow;
}

export function dealWorkflowActionIds(action: DealWorkflowAction) {
  return Array.from(new Set(action.ids));
}

export function dealWorkflowActionWhere(ownerId: string, action: DealWorkflowAction): Prisma.DealWhereInput {
  return {
    ownerId,
    id: { in: dealWorkflowActionIds(action) },
    status: { in: OPEN_DEAL_STATUSES },
  };
}

export function dealWorkflowNextAction(action: DealWorkflowAction["action"]) {
  return action === "revive"
    ? "Follow up and confirm buyer, budget, decision process, and next step."
    : "Prepare submission package and confirm route before the deadline.";
}

export function dealWorkflowTaskPlan(
  deal: DealWorkflowActionDeal,
  action: DealWorkflowAction["action"],
  now = new Date(),
): DealWorkflowTaskPlan {
  const nextAction = dealWorkflowNextAction(action);
  if (action === "revive") {
    return {
      dealId: deal.id,
      accountId: deal.accountId,
      title: `Follow up: ${deal.title}`,
      dueAt: tomorrowFrom(now),
      priority: "HIGH",
      nextAction,
    };
  }

  return {
    dealId: deal.id,
    accountId: deal.accountId,
    title: `Prepare submission: ${deal.title}`,
    dueAt: prepDueFrom(deal.deadline, now),
    priority: "URGENT",
    nextAction,
  };
}

export function dealWorkflowTaskKey(input: Pick<DealWorkflowTaskPlan, "dealId" | "title">) {
  return `${input.dealId}:${input.title}`;
}

export function dealWorkflowEmptyMessage(action: DealWorkflowAction) {
  return action.action === "revive" ? "No open deals to revive" : "No open deals to prepare";
}
