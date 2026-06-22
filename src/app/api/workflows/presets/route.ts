import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ensureDefaultWorkflowPresets,
  presetToWorkflowInput,
  workflowPresetData,
  workflowPresetFormSchema,
  workflowPresetOptionSummary,
  workflowPresetScheduleSummary,
} from "@/lib/workflows/presets";

function presetPayload(preset: Awaited<ReturnType<typeof db.workflowPreset.findMany>>[number]) {
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

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    await ensureDefaultWorkflowPresets(ownerId);
    const presets = await db.workflowPreset.findMany({
      where: { ownerId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 20,
    });
    return NextResponse.json({ presets: presets.map(presetPayload) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json().catch(() => ({}));
    const parsed = workflowPresetFormSchema.safeParse(json ?? {});

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      const preset = await db.workflowPreset.create({
        data: {
          ownerId,
          ...workflowPresetData(parsed.data),
        },
      });
      return NextResponse.json({ preset: presetPayload(preset) }, { status: 201 });
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
