import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { opportunityUpdateSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

type Ctx = { params: { id: string } };

// GET /api/opportunities/[id] — full detail (owner-scoped, 404 otherwise).
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const ownerId = await requireOwnerId();
    const opp = await db.opportunity.findUnique({
      where: { id: ctx.params.id },
      include: {
        source: true,
        contacts: true,
        attachments: true,
        tags: { include: { tag: true } },
        notes: { orderBy: { createdAt: "desc" } },
        drafts: { orderBy: { createdAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!opp || opp.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(opp);
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/opportunities/[id] — partial update with activity logging.
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ownerId = await requireOwnerId();

    const existing = await db.opportunity.findUnique({ where: { id: ctx.params.id } });
    if (!existing || existing.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const json = await req.json().catch(() => null);
    const parsed = opportunityUpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const data: Record<string, unknown> = { ...body };
    if (body.url === "") data.url = null;
    if (body.sourceId === "") data.sourceId = null;

    // Always refresh isActive from the effective deadline (incoming body.deadline
    // if present, else the existing row's deadline) unless isActive was explicit.
    const effectiveDeadline = body.deadline !== undefined ? body.deadline : existing.deadline;
    if (body.isActive === undefined) {
      data.isActive = !effectiveDeadline || new Date(effectiveDeadline).getTime() >= Date.now();
    }

    const statusChanged = body.status != null && body.status !== existing.status;

    const updated = await db.opportunity.update({
      where: { id: ctx.params.id },
      data,
    });

    if (statusChanged) {
      await db.activity.create({
        data: {
          opportunityId: updated.id,
          type: "STATUS_CHANGE",
          message: `Status changed from ${existing.status} to ${body.status}`,
          metadata: { from: existing.status, to: body.status },
        },
      });
    } else {
      await db.activity.create({
        data: {
          opportunityId: updated.id,
          type: "UPDATE",
          message: "Opportunity updated",
          metadata: { fields: Object.keys(body) },
        },
      });
    }

    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/opportunities/[id] — cascade delete (owner-scoped).
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const ownerId = await requireOwnerId();
    const existing = await db.opportunity.findUnique({ where: { id: ctx.params.id } });
    if (!existing || existing.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db.opportunity.delete({ where: { id: ctx.params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
