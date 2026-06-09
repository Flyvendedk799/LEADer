import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { listItemSchema } from "@/lib/validators";

// Confirms the parent list belongs to the owner before any mutation.
async function ownedList(listId: string, ownerId: string) {
  return db.list.findFirst({ where: { id: listId, ownerId }, select: { id: true } });
}

// POST /api/lists/[id]/items — add an opportunity to the list (idempotent).
export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const list = await ownedList(ctx.params.id, ownerId);
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    const body = await req.json();
    const parsed = listItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Verify the opportunity is also owned before linking it.
    const opp = await db.opportunity.findFirst({
      where: { id: parsed.data.opportunityId, ownerId },
      select: { id: true },
    });
    if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

    const item = await db.listItem.upsert({
      where: {
        listId_opportunityId: { listId: ctx.params.id, opportunityId: parsed.data.opportunityId },
      },
      update: {},
      create: { listId: ctx.params.id, opportunityId: parsed.data.opportunityId },
    });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Failed to add item" }, { status: 500 });
  }
}

// DELETE /api/lists/[id]/items — remove an opportunity from the list.
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    const list = await ownedList(ctx.params.id, ownerId);
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    const body = await req.json();
    const parsed = listItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await db.listItem.deleteMany({
      where: { listId: ctx.params.id, opportunityId: parsed.data.opportunityId },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove item" }, { status: 500 });
  }
}
