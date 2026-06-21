import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const accounts = await db.account.findMany({
      where: {
        ownerId,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
      include: { _count: { select: { deals: true, people: true, tasks: true } } },
      take: 100,
    });
    return NextResponse.json({ accounts });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = accountCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const account = await db.account.upsert({
      where: { ownerId_name: { ownerId, name: parsed.data.name } },
      update: parsed.data,
      create: { ownerId, ...parsed.data },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
