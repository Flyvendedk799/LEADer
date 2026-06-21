import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { runPlatformAgent } from "@/lib/agent";

const agentMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(4000),
    }))
    .max(12)
    .default([]),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = agentMessageSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const result = await runPlatformAgent({ user, ...parsed.data });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
