import { NextResponse } from "next/server";
import { requireOwnerId } from "@/lib/auth";
import { backfillEmbeddings } from "@/lib/opportunities/similar";
import { apiError } from "@/lib/api";

// POST /api/embeddings/backfill — embed the signed-in user's opportunities that
// don't yet have a vector. Safe to run repeatedly.
export async function POST() {
  try {
    const ownerId = await requireOwnerId();
    const result = await backfillEmbeddings(ownerId);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
