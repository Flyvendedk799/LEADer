import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { saveCandidateAsDeal } from "@/lib/crm";
import { db } from "@/lib/db";
import { discoveryCandidateActionSchema } from "@/lib/validators";

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = discoveryCandidateActionSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );

    const { action, reason, feedback } = parsed.data;
    if (action === "edit") {
      if (!parsed.data.changes) return NextResponse.json({ error: "Changes are required" }, { status: 400 });
      const changes = parsed.data.changes;
      const updated = await db.$transaction(async tx => {
        const result = await tx.discoveryCandidate.updateMany({ where: { id: params.id, ownerId, status: { in: ["NEW", "REVIEWED"] }, dealId: null }, data: { ...changes, status: "REVIEWED" } });
        if (result.count) await tx.evidence.create({ data: { ownerId, candidateId: params.id, kind: "USER_NOTE", title: "Owner corrections", snippet: JSON.stringify(changes), metadata: { provenance: { status: "owner-corrected", retrievedAt: new Date().toISOString(), reason: "Owner-entered corrections. Original source evidence is retained separately." }, changes } } });
        return result;
      });
      return NextResponse.json({ updated: updated.count }, { status: updated.count ? 200 : 404 });
    }

    if (action === "save") {
      const result = await saveCandidateAsDeal(ownerId, params.id);
      return NextResponse.json(result, { status: result.created ? 201 : 200 });
    }

    const status =
      action === "restore" ? "NEW" : action === "dismiss"
        ? "DISMISSED"
        : action === "duplicate"
          ? "DUPLICATE"
          : action === "review"
            ? "REVIEWED"
            : undefined;

    const candidate = await db.discoveryCandidate.updateMany({
      where: { id: params.id, ownerId, ...(action === "restore" || action === "snooze" ? { dealId: null } : {}) },
      data: {
        ...(action === "snooze" ? { snoozedUntil: new Date(Date.now() + 7 * 86400000) } : {}),
        ...(action === "restore" ? { snoozedUntil: null, dismissalReason: null } : {}),
        ...(status ? { status } : {}),
        ...(reason ? { dismissalReason: reason } : {}),
        ...(feedback ? { feedback: feedback as Prisma.InputJsonValue } : {}),
      },
    });
    if (candidate.count === 0)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await db.discoveryCandidate.findFirst({
      where: { id: params.id, ownerId },
      include: { evidence: true, deal: true, account: true, lane: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err);
  }
}
