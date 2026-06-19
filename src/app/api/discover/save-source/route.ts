import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { saveDiscoverySource } from "@/lib/discovery";
import { discoverySaveSourceSchema } from "@/lib/validators";

// POST /api/discover/save-source — promote a discovery list/source candidate
// into the user's monitored Source catalogue.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { candidate, workspace } = discoverySaveSourceSchema.parse(body);
    const result = await saveDiscoverySource(user.id, candidate, workspace);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return apiError(err);
  }
}
