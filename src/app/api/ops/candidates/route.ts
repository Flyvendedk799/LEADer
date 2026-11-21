import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { candidateQueryFromParams, listCandidates } from "@/lib/ops";

export const dynamic = "force-dynamic";

// GET /api/ops/candidates?status=NEW,REVIEWED&lane=<slug>&missionId=&q=&minScore=&sort=score|recent&limit=&offset=
export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    return NextResponse.json(await listCandidates(ownerId, candidateQueryFromParams(new URL(req.url).searchParams)));
  } catch (err) {
    return apiError(err);
  }
}
