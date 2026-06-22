import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  dealWorkflowActionIds,
  dealWorkflowActionSchema,
  dealWorkflowActionWhere,
  dealWorkflowEmptyMessage,
  dealWorkflowTaskKey,
  dealWorkflowTaskPlan,
} from "@/lib/crm/deal-workflow-actions";

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = dealWorkflowActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const ids = dealWorkflowActionIds(parsed.data);
    const deals = await db.deal.findMany({
      where: dealWorkflowActionWhere(ownerId, parsed.data),
      select: { id: true, accountId: true, title: true, deadline: true },
    });
    if (deals.length === 0) {
      return NextResponse.json({ error: dealWorkflowEmptyMessage(parsed.data) }, { status: 404 });
    }

    const plans = deals.map((deal) => dealWorkflowTaskPlan(deal, parsed.data.action));
    const existingTasks = await db.task.findMany({
      where: {
        ownerId,
        status: "OPEN",
        OR: plans.map((plan) => ({ dealId: plan.dealId, title: plan.title })),
      },
      select: { dealId: true, title: true },
    });
    const existingKeys = new Set(
      existingTasks
        .filter((task): task is { dealId: string; title: string } => Boolean(task.dealId))
        .map(dealWorkflowTaskKey),
    );
    const newTasks = plans.filter((plan) => !existingKeys.has(dealWorkflowTaskKey(plan)));

    const tasksCreated = newTasks.length
      ? await db.task.createMany({
          data: newTasks.map((plan) => ({
            ownerId,
            accountId: plan.accountId,
            dealId: plan.dealId,
            title: plan.title,
            dueAt: plan.dueAt,
            priority: plan.priority,
          })),
        })
      : { count: 0 };

    await db.deal.updateMany({
      where: { ownerId, id: { in: deals.map((deal) => deal.id) } },
      data: { nextAction: plans[0]?.nextAction },
    });

    return NextResponse.json({
      ok: true,
      action: parsed.data.action,
      count: deals.length,
      tasksCreated: tasksCreated.count,
      skippedExistingTasks: plans.length - newTasks.length,
      missing: ids.length - deals.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
