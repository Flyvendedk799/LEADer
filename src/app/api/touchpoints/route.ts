import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { touchpointCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const url = new URL(req.url);
    const dealId = url.searchParams.get("dealId") || undefined;
    const accountId = url.searchParams.get("accountId") || undefined;
    const touchpoints = await db.touchpoint.findMany({
      where: { ownerId, ...(dealId ? { dealId } : {}), ...(accountId ? { accountId } : {}) },
      include: { account: true, deal: true, person: true },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ touchpoints });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = touchpointCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const touchpoint = await db.touchpoint.create({
      data: {
        ownerId,
        ...parsed.data,
        metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return NextResponse.json(touchpoint, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
