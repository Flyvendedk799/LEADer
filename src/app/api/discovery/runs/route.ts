import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDiscoveryMission } from "@/lib/crm";
import { discoveryRunCreateSchema } from "@/lib/validators";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const missions = await db.discoveryMission.findMany({
      where: { ownerId },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { lane: true, _count: { select: { candidates: true } } },
    });
    return NextResponse.json({ missions });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = discoveryRunCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const result = await runDiscoveryMission(ownerId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
