import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  presetToWorkflowInput,
  workflowPresetData,
  workflowPresetFormSchema,
  workflowPresetOptionSummary,
  workflowPresetScheduleSummary,
  workflowPresetUpdateSchema,
} from "@/lib/workflows/presets";

function presetPayload(preset: Awaited<ReturnType<typeof db.workflowPreset.findFirstOrThrow>>) {
  const input = presetToWorkflowInput(preset);
  return {
    ...preset,
    options: input.options ?? {},
    optionSummary: workflowPresetOptionSummary(input.options),
    scheduleSummary: workflowPresetScheduleSummary(preset),
  };
}

function uniqueNameError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const existing = await db.workflowPreset.findFirst({ where: { id: params.id, ownerId } });
    if (!existing) return NextResponse.json({ error: "Workflow preset not found" }, { status: 404 });

    const json = await req.json().catch(() => ({}));
    const parsed = workflowPresetUpdateSchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const merged = {
      name: parsed.data.name ?? existing.name,
      description: parsed.data.description === undefined ? existing.description : parsed.data.description,
      playbook: parsed.data.playbook ?? existing.playbook,
      workspace: parsed.data.workspace ?? existing.workspace,
      options: parsed.data.options === undefined ? existing.options ?? {} : parsed.data.options,
      pinned: parsed.data.pinned ?? existing.pinned,
      scheduleEnabled: parsed.data.scheduleEnabled ?? existing.scheduleEnabled,
      scheduleIntervalHours: parsed.data.scheduleIntervalHours ?? existing.scheduleIntervalHours,
      scheduleNextRunAt:
        parsed.data.scheduleNextRunAt === undefined ? existing.scheduleNextRunAt : parsed.data.scheduleNextRunAt,
    };
    const presetInput = workflowPresetFormSchema.safeParse(merged);
    if (!presetInput.success) {
      return NextResponse.json({ error: presetInput.error.flatten() }, { status: 400 });
    }

    try {
      const preset = await db.workflowPreset.update({
        where: { id: existing.id },
        data: workflowPresetData(presetInput.data),
      });
      return NextResponse.json({ preset: presetPayload(preset) });
    } catch (error) {
      if (uniqueNameError(error)) {
        return NextResponse.json({ error: "A workflow preset with that name already exists." }, { status: 409 });
      }
      throw error;
    }
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const deleted = await db.workflowPreset.deleteMany({ where: { id: params.id, ownerId } });
    if (deleted.count === 0) return NextResponse.json({ error: "Workflow preset not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
