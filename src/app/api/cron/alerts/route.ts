// Cron entrypoint for alert dispatch (deadline reminders + optional digest).
//
// Triggers:
//   - Scheduler (x-cron-secret, no session) → runs for every owner.
//   - In-app (authenticated) → runs for the signed-in user.
//
// Body: { digest?: boolean, workspace?: "DK" | "GLOBAL" }
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { dispatchForAllOwners, dispatchForOwner } from "@/lib/alerts/dispatch";
import { apiError, validCronSecret } from "@/lib/api";

const bodySchema = z.object({
  digest: z.boolean().optional(),
  workspace: z.enum(["DK", "GLOBAL"]).optional(),
});

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
