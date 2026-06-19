import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { saveDiscoveryCandidate } from "@/lib/discovery";
import { discoverySaveSchema } from "@/lib/validators";

// POST /api/discover/save — promote a discovery candidate into the normal
// opportunity pipeline, with automated-discovery provenance and scoring.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { candidate, workspace } = discoverySaveSchema.parse(body);
    const result = await saveDiscoveryCandidate(user.id, candidate, workspace);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return apiError(err);
  }
}
