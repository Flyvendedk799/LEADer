import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  sourceWorkflowActionIds,
  sourceWorkflowActionLabel,
  sourceWorkflowActionSchema,
  sourceWorkflowActionTargets,
  sourceWorkflowActionWhere,
} from "@/lib/sources/actions";

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = sourceWorkflowActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const ids = sourceWorkflowActionIds(parsed.data);

    const sources = await db.source.findMany({
      where: sourceWorkflowActionWhere(ownerId, parsed.data),
      select: { id: true, type: true, frequency: true, lastCheckedAt: true },
    });
    const now = new Date();
    const targets = sourceWorkflowActionTargets(sources, parsed.data.action, now);

    if (parsed.data.action === "DISABLE") {
      const disabled = targets.length
        ? await db.source.updateMany({
            where: { ownerId, id: { in: targets.map((source) => source.id) } },
            data: { enabled: false },
          })
        : { count: 0 };
      return NextResponse.json({
        ok: true,
        action: parsed.data.action,
        label: sourceWorkflowActionLabel(parsed.data.action),
        count: disabled.count,
        missing: ids.length - sources.length,
      });
    }

    const skipped = targets.length
      ? await db.source.updateMany({
          where: { ownerId, id: { in: targets.map((source) => source.id) } },
          data: { lastCheckedAt: now },
        })
      : { count: 0 };

    return NextResponse.json({
      ok: true,
      action: parsed.data.action,
      label: sourceWorkflowActionLabel(parsed.data.action),
      count: skipped.count,
      skippedNotDue: sources.length - targets.length,
      missing: ids.length - sources.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
