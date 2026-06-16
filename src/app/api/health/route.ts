import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasLlmKey } from "@/lib/env";
import { emailEnabled } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET /api/health — liveness + DB connectivity. Use for uptime checks / deploys.
export async function GET() {
  const started = Date.now();
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      ai: hasLlmKey() ? "live" : "mock",
      email: emailEnabled() ? "live" : "off",
      latencyMs: Date.now() - started,
    },
    { status: dbOk ? 200 : 503 },
  );
}
