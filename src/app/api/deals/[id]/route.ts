import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { DEAL_INCLUDE } from "@/lib/crm";
import { pursuitScore } from "@/lib/crm/scoring";
import { db } from "@/lib/db";
import { dealUpdateSchema } from "@/lib/validators";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const deal = await db.deal.findFirst({ where: { id: params.id, ownerId }, include: DEAL_INCLUDE });
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(deal);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const existing = await db.deal.findFirst({ where: { id: params.id, ownerId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const parsed = dealUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const d = parsed.data;
    const deal = await db.deal.update({
      where: { id: existing.id },
      data: {
        ...d,
        url: d.url === "" ? null : d.url,
        pursuitScore: d.pursuitScore ?? pursuitScore({
          matchScore: d.matchScore ?? existing.matchScore,
          confidenceScore: d.confidenceScore ?? existing.confidenceScore,
          deadline: d.deadline ?? existing.deadline,
          priority: d.priority ?? existing.priority,
        }),
      },
      include: DEAL_INCLUDE,
    });
    return NextResponse.json(deal);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    await db.deal.deleteMany({ where: { id: params.id, ownerId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
