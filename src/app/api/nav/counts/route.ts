import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { filterVisibleLaneCandidates } from "@/lib/crm/lanes";
import { db } from "@/lib/db";
import { taskWorkspaceWhere } from "@/lib/tasks/scope";
import type { Workspace } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const { searchParams } = new URL(req.url, "http://localhost");
    const workspace: Workspace =
      searchParams.get("workspace") === "GLOBAL" ? "GLOBAL" : "DK";
    const now = new Date();

    const [candidates, openTasks, overdueTasks] = await Promise.all([
      db.discoveryCandidate.findMany({
        where: {
          ownerId,
          workspace,
          status: { in: ["NEW", "REVIEWED"] },
        },
        include: { lane: true },
      }),
      db.task.count({
        where: {
          ownerId,
          ...taskWorkspaceWhere(workspace),
          status: "OPEN",
        },
      }),
      db.task.count({
        where: {
          ownerId,
          ...taskWorkspaceWhere(workspace),
          status: "OPEN",
          dueAt: { lt: now },
        },
      }),
    ]);

    const unreviewedLeads = filterVisibleLaneCandidates(candidates).length;

    return NextResponse.json({ unreviewedLeads, openTasks, overdueTasks });
  } catch (err) {
    return apiError(err);
  }
}
