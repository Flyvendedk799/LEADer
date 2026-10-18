import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const { searchParams } = new URL(req.url, "http://localhost");
    const workspace = searchParams.get("workspace") === "GLOBAL" ? "GLOBAL" : "DK";
    const now = new Date();

    const [unreviewedLeads, openTasks, overdueTasks] = await Promise.all([
      db.discoveryCandidate.count({
        where: {
          ownerId,
          workspace,
          status: { in: ["NEW", "REVIEWED"] },
        },
      }),
      db.task.count({
        where: {
          ownerId,
          status: "OPEN",
        },
      }),
      db.task.count({
        where: {
          ownerId,
          status: "OPEN",
          dueAt: { lt: now },
        },
      }),
    ]);

    return NextResponse.json({ unreviewedLeads, openTasks, overdueTasks });
  } catch (err) {
    return apiError(err);
  }
}
