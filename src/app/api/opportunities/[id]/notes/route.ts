import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { noteCreateSchema } from "@/lib/validators";

type Ctx = { params: { id: string } };

// POST /api/opportunities/[id]/notes — add a note + NOTE activity.
export async function POST(req: Request, ctx: Ctx) {
  try {
    const ownerId = await requireOwnerId();

    const opp = await db.opportunity.findUnique({ where: { id: ctx.params.id } });
    if (!opp || opp.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const json = await req.json().catch(() => null);
    const parsed = noteCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const note = await db.note.create({
      data: {
        opportunityId: ctx.params.id,
        authorId: ownerId,
        body: body.body,
        pinned: body.pinned ?? false,
      },
    });

    await db.activity.create({
      data: {
        opportunityId: ctx.params.id,
        type: "NOTE",
        message: "Note added",
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
