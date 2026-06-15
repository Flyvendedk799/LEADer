import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { OPPORTUNITY_INCLUDE } from "@/lib/opportunities";
import { listCreateSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

// GET /api/lists/[id] — one list with its opportunities.
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const list = await db.list.findFirst({
      where: { id: ctx.params.id, ownerId },
      include: {
        _count: { select: { items: true } },
        items: {
          orderBy: { addedAt: "desc" },
          include: { opportunity: { include: OPPORTUNITY_INCLUDE } },
        },
      },
    });
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
    return NextResponse.json(list);
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/lists/[id] — rename / edit list metadata.
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const existing = await db.list.findFirst({
      where: { id: ctx.params.id, ownerId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "List not found" }, { status: 404 });

    const body = await req.json();
    const parsed = listCreateSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const list = await db.list.update({
      where: { id: ctx.params.id },
      data: parsed.data,
      include: { _count: { select: { items: true } } },
    });
    return NextResponse.json(list);
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/lists/[id] — delete a list (items cascade).
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const existing = await db.list.findFirst({
      where: { id: ctx.params.id, ownerId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "List not found" }, { status: 404 });

    await db.list.delete({ where: { id: ctx.params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
