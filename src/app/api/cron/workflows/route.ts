// Cron entrypoint for scheduled workflow presets.
//
// Triggers:
//   - Scheduler (x-cron-secret, no session) -> queues due presets for every owner.
//   - In-app/authenticated call -> queues due presets for the signed-in user.
import { NextResponse } from "next/server";

import { apiError, validCronSecret } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { drainQueuedWorkflowRuns, drainQueuedWorkflowRunsAllOwners } from "@/lib/workflows/queue";
import { queueDueWorkflowPresets, queueDueWorkflowPresetsAllOwners } from "@/lib/workflows/preset-runs";

export async function POST(req: Request) {
  try {
    const now = new Date();
    const user = await getCurrentUser();

    if (user) {
      const results = await queueDueWorkflowPresets(user.id, now);
      const drained = await drainQueuedWorkflowRuns(user.id, 3);
      return NextResponse.json({
        scope: "owner",
        queued: results.filter((item) => item.status === "QUEUED").length,
        drained,
        results,
      });
    }

    if (!validCronSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const byOwner = await queueDueWorkflowPresetsAllOwners(now);
    const drained = await drainQueuedWorkflowRunsAllOwners(2);
    const queued = Object.values(byOwner).reduce(
      (total, results) => total + results.filter((item) => item.status === "QUEUED").length,
      0,
    );
    return NextResponse.json({ scope: "all", queued, drained, byOwner });
  } catch (err) {
    return apiError(err);
  }
}
