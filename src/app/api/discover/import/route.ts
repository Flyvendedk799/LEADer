import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { importPastedDiscovery } from "@/lib/crm";

const importSchema = z.object({
  laneId: z.string().min(1),
  workspace: z.enum(["DK", "GLOBAL"]).optional(),
  text: z.string().trim().min(10, "Paste some text first").max(60_000),
});

// POST /api/discover/import — bring leads found elsewhere (e.g. a ChatGPT answer)
// into Discover as scored, deduplicated candidates in the review queue.
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const parsed = importSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json(await importPastedDiscovery(ownerId, parsed.data));
  } catch (err) {
    return apiError(err);
  }
}
