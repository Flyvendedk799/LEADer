import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { bulkOpportunitySchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

// POST /api/opportunities/bulk — apply one action to a selection of opportunities.
// Every id is re-scoped to the owner server-side, so a client can never act on
// rows it doesn't own even if it posts arbitrary ids.
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();

    const json = await req.json().catch(() => null);
    const parsed = bulkOpportunitySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { ids, action, status, priority, listId } = parsed.data;

    // Keep only ids that actually belong to this owner.
    const owned = await db.opportunity.findMany({
      where: { id: { in: ids }, ownerId },
      select: { id: true, status: true },
    });
    const ownedIds = owned.map((o) => o.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ error: "No matching opportunities" }, { status: 404 });
    }

    let count = 0;

    switch (action) {
      case "setStatus": {
        const changed = owned.filter((o) => o.status !== status).map((o) => o.id);
        const res = await db.opportunity.updateMany({
          where: { id: { in: ownedIds }, ownerId },
          data: { status },
        });
        count = res.count;
        if (changed.length) {
          await db.activity.createMany({
            data: changed.map((id) => ({
              opportunityId: id,
              type: "STATUS_CHANGE" as const,
              message: `Status changed to ${status} (bulk)`,
              metadata: { to: status, bulk: true },
            })),
          });
        }
        break;
      }
      case "setPriority": {
        const res = await db.opportunity.updateMany({
          where: { id: { in: ownedIds }, ownerId },
          data: { priority },
        });
        count = res.count;
        break;
      }
      case "addToWatchlist": {
        const res = await db.watchlistItem.createMany({
          data: ownedIds.map((opportunityId) => ({ ownerId, opportunityId, priority: 1 })),
          skipDuplicates: true,
        });
        count = res.count;
        break;
      }
      case "removeFromWatchlist": {
        const res = await db.watchlistItem.deleteMany({
          where: { ownerId, opportunityId: { in: ownedIds } },
        });
        count = res.count;
        break;
      }
      case "addToList": {
        const list = await db.list.findFirst({
          where: { id: listId, ownerId },
          select: { id: true },
        });
        if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
        const res = await db.listItem.createMany({
          data: ownedIds.map((opportunityId) => ({ listId: list.id, opportunityId })),
          skipDuplicates: true,
        });
        count = res.count;
        break;
      }
      case "delete": {
        const res = await db.opportunity.deleteMany({
          where: { id: { in: ownedIds }, ownerId },
        });
        count = res.count;
        break;
      }
    }

    return NextResponse.json({ ok: true, action, count });
  } catch (err) {
    return apiError(err);
  }
}
