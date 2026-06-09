import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { scoreOpportunity } from "@/lib/scoring";
import type { ScoreWeights } from "@/lib/types";

// POST /api/score — (re)compute match scores for given ids or all owner leads.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const json = await req.json().catch(() => ({}));
    const ids: string[] | undefined =
      json && Array.isArray(json.ids) ? (json.ids as string[]) : undefined;

    const opportunities = await db.opportunity.findMany({
      where: { ownerId: user.id, ...(ids?.length ? { id: { in: ids } } : {}) },
      include: { contacts: true },
    });

    const weights = (user.scoringWeights as Partial<ScoreWeights>) || undefined;
    let updated = 0;

    for (const o of opportunities) {
      const breakdown = scoreOpportunity(
        {
          title: o.title,
          description: o.description,
          rawContent: o.rawContent,
          budgetMin: o.budgetMin,
          budgetMax: o.budgetMax,
          deadline: o.deadline,
          organization: o.organization,
          category: o.category,
          applicationRoute: o.applicationRoute,
          contacts: o.contacts,
        },
        { budgetMaxDkk: user.budgetMaxDkk, weights },
      );
      breakdown.computedAt = new Date().toISOString();

      await db.opportunity.update({
        where: { id: o.id },
        data: { matchScore: breakdown.total, scoreBreakdown: breakdown as object },
      });
      await db.activity.create({
        data: {
          opportunityId: o.id,
          type: "SCORE",
          message: `Rescored to ${breakdown.total}`,
          metadata: { score: breakdown.total },
        },
      });
      updated++;
    }

    return NextResponse.json({ updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
