import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDefaultDiscoveryLanes } from "@/lib/crm/lanes";
import { discoveryLaneCreateSchema } from "@/lib/validators";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    await ensureDefaultDiscoveryLanes(ownerId);
    const lanes = await db.discoveryLane.findMany({
      where: { ownerId },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { candidates: true, missions: true, deals: true } },
      },
    });
    return NextResponse.json({ lanes });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = discoveryLaneCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const lane = await db.discoveryLane.upsert({
      where: { ownerId_slug: { ownerId, slug: parsed.data.slug } },
      update: parsed.data,
      create: { ownerId, ...parsed.data },
    });
    return NextResponse.json(lane, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
