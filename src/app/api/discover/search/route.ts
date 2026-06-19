import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { runDiscoverySearch } from "@/lib/discovery";
import { discoverySearchSchema } from "@/lib/validators";

// POST /api/discover/search — run an on-demand lead discovery search for the
// signed-in owner. This is intentionally separate from cron/source monitoring:
// it powers the human "find me leads like this" workflow.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const input = discoverySearchSchema.parse(body);
    const result = await runDiscoverySearch(user.id, input);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
