import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { saveCandidateAsDeal } from "@/lib/crm";
import { db } from "@/lib/db";
import {
  discoveryCandidateBulkActionSchema,
  discoveryCandidateBulkEmptyMessage,
  discoveryCandidateBulkIds,
  discoveryCandidateBulkUpdateData,
  discoveryCandidateBulkWhere,
} from "@/lib/discovery/candidate-actions";

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = discoveryCandidateBulkActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    if (parsed.data.action === "save") {
      const ids = discoveryCandidateBulkIds(parsed.data);
      const candidates = await db.discoveryCandidate.findMany({
        where: discoveryCandidateBulkWhere(ownerId, parsed.data),
        select: { id: true },
      });
      if (candidates.length === 0) {
        return NextResponse.json({ error: discoveryCandidateBulkEmptyMessage(parsed.data) }, { status: 404 });
      }

      const saved = [];
      for (const candidate of candidates) {
        const result = await saveCandidateAsDeal(ownerId, candidate.id);
        saved.push({
          id: candidate.id,
          dealId: result.deal.id,
          created: result.created,
        });
      }

      return NextResponse.json({
        ok: true,
        count: saved.length,
        created: saved.filter((result) => result.created).length,
        existing: saved.filter((result) => !result.created).length,
        missing: ids.length - candidates.length,
        results: saved,
      });
    }

    const result = await db.discoveryCandidate.updateMany({
      where: discoveryCandidateBulkWhere(ownerId, parsed.data),
      data: discoveryCandidateBulkUpdateData(parsed.data),
    });
    if (result.count === 0) {
      return NextResponse.json({ error: discoveryCandidateBulkEmptyMessage(parsed.data) }, { status: 404 });
    }
    return NextResponse.json({ ok: true, count: result.count });
  } catch (err) {
    return apiError(err);
  }
}
