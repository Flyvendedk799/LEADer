import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { previewWorkflowRun } from "@/lib/workflows/preview";
import { workflowRunInputSchema } from "@/lib/workflows/types";

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json().catch(() => ({}));
    const parsed = workflowRunInputSchema.safeParse(json ?? {});

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const preview = await previewWorkflowRun(ownerId, parsed.data);
    return NextResponse.json({ preview });
  } catch (err) {
    return apiError(err);
  }
}
