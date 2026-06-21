import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversionAssetCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const url = new URL(req.url);
    const dealId = url.searchParams.get("dealId") || undefined;
    const accountId = url.searchParams.get("accountId") || undefined;
    const assets = await db.conversionAsset.findMany({
      where: { ownerId, ...(dealId ? { dealId } : {}), ...(accountId ? { accountId } : {}) },
      include: { account: true, deal: true, candidate: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ assets });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = conversionAssetCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const asset = await db.conversionAsset.create({ data: { ownerId, ...parsed.data } });
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
