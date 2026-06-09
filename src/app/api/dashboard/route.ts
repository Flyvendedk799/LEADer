import { NextResponse } from "next/server";
import { requireOwnerId } from "@/lib/auth";
import { getDashboardMetrics } from "@/lib/dashboard";
import type { Workspace } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const { searchParams } = new URL(req.url);
    const workspace: Workspace = searchParams.get("workspace") === "GLOBAL" ? "GLOBAL" : "DK";
    const metrics = await getDashboardMetrics(ownerId, workspace);
    return NextResponse.json(metrics);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dashboard metrics" },
      { status: 500 },
    );
  }
}
