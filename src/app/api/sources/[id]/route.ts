import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { sourceUpdateSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

// GET /api/sources/[id] — fetch one owner-scoped source.
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const source = await db.source.findFirst({
      where: { id: ctx.params.id, ownerId },
      include: { _count: { select: { opportunities: true } } },
    });
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(source);
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/sources/[id] — partial update of an owner-scoped source.
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json();
    const parsed = sourceUpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await db.source.findFirst({ where: { id: ctx.params.id, ownerId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { url, ...rest } = parsed.data;
    const source = await db.source.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(url !== undefined ? { url: url || null } : {}),
      },
      include: { _count: { select: { opportunities: true } } },
    });
    return NextResponse.json(source);
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/sources/[id] — remove an owner-scoped source.
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const existing = await db.source.findFirst({ where: { id: ctx.params.id, ownerId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.source.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
