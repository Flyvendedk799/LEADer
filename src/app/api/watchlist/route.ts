import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { OPPORTUNITY_INCLUDE } from "@/lib/opportunities";
import { watchlistSchema, listItemSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

// GET /api/watchlist — pinned opportunities, highest priority first.
export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const items = await db.watchlistItem.findMany({
      where: { ownerId },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { opportunity: { include: OPPORTUNITY_INCLUDE } },
    });
    return NextResponse.json(items);
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/watchlist — pin an opportunity (idempotent on opportunityId).
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json();
    const parsed = watchlistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { opportunityId, priority, reminderAt } = parsed.data;

    // Verify ownership of the opportunity being pinned.
    const opp = await db.opportunity.findFirst({
      where: { id: opportunityId, ownerId },
      select: { id: true },
    });
    if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

    const item = await db.watchlistItem.upsert({
      where: { opportunityId },
      update: { priority, reminderAt },
      create: { ownerId, opportunityId, priority, reminderAt },
      include: { opportunity: { include: OPPORTUNITY_INCLUDE } },
    });

    if (reminderAt) {
      await db.activity.create({
        data: {
          opportunityId,
          type: "REMINDER",
          message: `Reminder set for ${new Date(reminderAt).toISOString()}`,
          metadata: { reminderAt: new Date(reminderAt).toISOString(), priority },
        },
      });
    }

    return NextResponse.json(item);
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/watchlist — unpin an opportunity.
export async function DELETE(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json();
    const parsed = listItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await db.watchlistItem.deleteMany({
      where: { ownerId, opportunityId: parsed.data.opportunityId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
