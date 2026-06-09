import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { exportRequestSchema, parseFilters } from "@/lib/validators";
import { buildWhere, buildOrderBy } from "@/lib/opportunities";
import { exportOpportunities } from "@/lib/export";
import type { OpportunityFilter } from "@/lib/types";

const EXPORT_INCLUDE = {
  source: true,
  notes: true,
  tags: { include: { tag: true } },
} as const;

// POST /api/export — export selected ids or a filtered set in any format.
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();

    const json = await req.json().catch(() => null);
    const parsed = exportRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { format, ids, filters, title } = parsed.data;

    let items;
    if (ids?.length) {
      items = await db.opportunity.findMany({
        where: { ownerId, id: { in: ids } },
        include: EXPORT_INCLUDE,
        orderBy: { matchScore: "desc" },
      });
    } else {
      // Normalise loose filter object into an OpportunityFilter via parseFilters.
      const sp = new URLSearchParams();
      const raw = (filters ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) {
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
        else sp.append(k, String(v));
      }
      const f = parseFilters(sp) as OpportunityFilter;
      items = await db.opportunity.findMany({
        where: buildWhere(ownerId, f),
        include: EXPORT_INCLUDE,
        orderBy: buildOrderBy(f),
      });
    }

    const result = await exportOpportunities(items, format, { title });

    return new Response(result.body as BodyInit, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
