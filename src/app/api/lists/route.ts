import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { listCreateSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

// GET /api/lists — all lists for the owner, with item counts.
export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const lists = await db.list.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
    return NextResponse.json(lists);
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/lists — create a list.
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json();
    const parsed = listCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const list = await db.list.create({
      data: { ...parsed.data, ownerId },
      include: { _count: { select: { items: true } } },
    });
    return NextResponse.json(list);
  } catch (err) {
    return apiError(err);
  }
}
