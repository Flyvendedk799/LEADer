import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { runDailySweep } from "@/lib/workflows/playbooks";

const workflowRunSchema = z.object({
  playbook: z.enum(["daily-sweep"]),
  workspace: z.enum(["DK", "GLOBAL"]).default("DK"),
});

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json().catch(() => ({}));
    const parsed = workflowRunSchema.safeParse(json ?? {});

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    switch (parsed.data.playbook) {
      case "daily-sweep":
        return NextResponse.json(await runDailySweep(ownerId, parsed.data.workspace));
    }
  } catch (err) {
    return apiError(err);
  }
}
