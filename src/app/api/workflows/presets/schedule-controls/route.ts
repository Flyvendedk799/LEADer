import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  workflowPresetBulkScheduleActionSchema,
  workflowPresetBulkScheduleLabel,
  workflowPresetBulkScheduleMessage,
  workflowPresetBulkSchedulePayload,
  workflowPresetBulkScheduleReason,
  workflowPresetBulkScheduleWhere,
} from "@/lib/workflows/schedule-controls";

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = workflowPresetBulkScheduleActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const presets = await db.workflowPreset.findMany({
      where: workflowPresetBulkScheduleWhere(ownerId, parsed.data.action),
      select: {
        id: true,
        pinned: true,
        scheduleEnabled: true,
        scheduleIntervalHours: true,
        scheduleNextRunAt: true,
      },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 100,
    });
    const now = new Date();
    const reason = workflowPresetBulkScheduleReason(parsed.data.action);
    const message = workflowPresetBulkScheduleMessage(parsed.data.action);
    const updates = await Promise.all(
      presets.map((preset) =>
        db.workflowPreset.update({
          where: { id: preset.id },
          data: workflowPresetBulkSchedulePayload(preset, parsed.data.action, now),
          select: { id: true },
        }),
      ),
    );
    if (updates.length) {
      await db.workflowPresetEvent.createMany({
        data: updates.map((preset) => ({
          ownerId,
          presetId: preset.id,
          eventType: "CONTROL",
          reason,
          message,
          metadata: { action: parsed.data.action },
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      action: parsed.data.action,
      label: workflowPresetBulkScheduleLabel(parsed.data.action),
      count: updates.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
