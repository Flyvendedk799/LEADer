import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { saveCandidateAsDeal } from "@/lib/crm";
import { db } from "@/lib/db";
import { discoveryCandidateActionSchema } from "@/lib/validators";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = discoveryCandidateActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { action, reason, feedback } = parsed.data;
    if (action === "save") {
      const result = await saveCandidateAsDeal(ownerId, params.id);
      return NextResponse.json(result, { status: result.created ? 201 : 200 });
    }

    const status =
      action === "dismiss" ? "DISMISSED" :
      action === "duplicate" ? "DUPLICATE" :
      action === "review" ? "REVIEWED" :
      undefined;

    const candidate = await db.discoveryCandidate.updateMany({
      where: { id: params.id, ownerId },
      data: {
        ...(status ? { status } : {}),
        ...(reason ? { dismissalReason: reason } : {}),
        ...(feedback ? { feedback: feedback as Prisma.InputJsonValue } : {}),
      },
    });
    if (candidate.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await db.discoveryCandidate.findFirst({
      where: { id: params.id, ownerId },
      include: { evidence: true, deal: true, account: true, lane: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err);
  }
}
