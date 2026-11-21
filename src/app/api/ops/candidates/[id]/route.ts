import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { getCandidate } from "@/lib/ops";

export const dynamic = "force-dynamic";

// GET /api/ops/candidates/:id — the full candidate with raw content, score
// breakdown, evidence, mission and lane. Review actions stay on
// PATCH /api/discovery/candidates/:id.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwnerId();
    const { id } = await props.params;
    const candidate = await getCandidate(ownerId, id);
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(candidate);
  } catch (err) {
    return apiError(err);
  }
}
