import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEAL_INCLUDE, listDeals } from "@/lib/crm";
import { pursuitScore } from "@/lib/crm/scoring";
import { dealCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const result = await listDeals(ownerId, new URL(req.url).searchParams);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = dealCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const d = parsed.data;
    const deal = await db.deal.create({
      data: {
        ownerId,
        ...d,
        url: d.url || undefined,
        pursuitScore: d.pursuitScore ?? pursuitScore({
          matchScore: d.matchScore,
          confidenceScore: d.confidenceScore,
          deadline: d.deadline,
          priority: d.priority,
        }),
      },
      include: DEAL_INCLUDE,
    });
    return NextResponse.json(deal, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
