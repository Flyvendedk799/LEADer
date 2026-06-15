// Cron entrypoint for alert dispatch (deadline reminders + optional digest).
//
// Triggers:
//   - Scheduler (x-cron-secret, no session) → runs for every owner.
//   - In-app (authenticated) → runs for the signed-in user.
//
// Body: { digest?: boolean, workspace?: "DK" | "GLOBAL" }
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { dispatchForAllOwners, dispatchForOwner } from "@/lib/alerts/dispatch";
import { apiError } from "@/lib/api";

const bodySchema = z.object({
  digest: z.boolean().optional(),
  workspace: z.enum(["DK", "GLOBAL"]).optional(),
});

function validCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json ?? {});
    const opts = parsed.success ? parsed.data : {};

    const user = await getCurrentUser();
    if (user) {
      const result = await dispatchForOwner(user.id, opts);
      return NextResponse.json({ scope: "owner", result });
    }

    if (!validCronSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const byOwner = await dispatchForAllOwners(opts);
    return NextResponse.json({ scope: "all", byOwner });
  } catch (err) {
    return apiError(err);
  }
}
