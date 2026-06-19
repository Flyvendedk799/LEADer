import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { saveDiscoveryFeedback } from "@/lib/discovery";
import { discoveryFeedbackSchema } from "@/lib/validators";

// POST /api/discover/feedback — record lightweight review feedback for a
// discovery candidate without turning it into an opportunity.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { candidate, feedback, reason } = discoveryFeedbackSchema.parse(body);
    const result = await saveDiscoveryFeedback(user.id, candidate, feedback, reason);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
