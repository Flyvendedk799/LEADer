import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { opsOverview } from "@/lib/ops";

export const dynamic = "force-dynamic";

// GET /api/ops/overview — worker, budgets, providers, queue, recent runs and
// failures in one response. Intended for operators and agents.
export async function GET() {
  try {
    return NextResponse.json(await opsOverview(await requireUser()));
  } catch (err) {
    return apiError(err);
  }
}
