import { NextResponse } from "next/server";
import { requireOwnerId } from "@/lib/auth";
import { findSimilar } from "@/lib/opportunities/similar";
import { apiError } from "@/lib/api";

// GET /api/opportunities/:id/similar — semantically related opportunities.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const limit = Number(new URL(req.url).searchParams.get("limit")) || 6;
    const results = await findSimilar(ownerId, params.id, Math.min(20, Math.max(1, limit)));
    return NextResponse.json({ results });
  } catch (err) {
    return apiError(err);
  }
}
