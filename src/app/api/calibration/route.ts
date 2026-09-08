import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { scoreOpportunity } from "@/lib/scoring";
import { loadOrComputeCalibration, recomputeCalibration } from "@/lib/scoring/outcomes";
import { MIN_EFFECTIVE_SAMPLES } from "@/lib/scoring/calibration";
import type { ScoreWeights } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Calibration API — the outcome loop.
//
// GET  returns what the owner's own won/lost/archived decisions have taught
//      the scorer, with the sample sizes behind every claim.
// POST relearns it, and optionally rescores the whole pipeline so the new
//      ranking is visible immediately rather than at the next discovery run.
// ─────────────────────────────────────────────────────────────────────────

/** How many more decisions are needed before learning switches on. */
function samplesUntilUseful(sampleCount: number): number {
  return Math.max(0, Math.ceil(MIN_EFFECTIVE_SAMPLES - sampleCount));
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const model = await loadOrComputeCalibration(user.id);
    return NextResponse.json({
      model,
      samplesNeeded: samplesUntilUseful(model.sampleCount),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const json = await req.json().catch(() => ({}));
    const rescore = json?.rescore !== false; // rescoring is the point; opt out explicitly

    const model = await recomputeCalibration(user.id);

    let rescored = 0;
    if (rescore && !model.insufficientData) {
      rescored = await rescorePipeline(user.id, model, {
        budgetMaxDkk: user.budgetMaxDkk,
        weights: (user.scoringWeights as Partial<ScoreWeights>) || undefined,
      });
    }

    return NextResponse.json({
      model,
      rescored,
      samplesNeeded: samplesUntilUseful(model.sampleCount),
    });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * Re-rank every lead under the new model.
 *
 * Only rows whose score actually moved are written, so a recompute that changes
 * nothing costs no writes and leaves no misleading trail in the activity feed.
 */
async function rescorePipeline(
  ownerId: string,
  calibration: Awaited<ReturnType<typeof recomputeCalibration>>,
  profile: { budgetMaxDkk?: number; weights?: Partial<ScoreWeights> },
): Promise<number> {
  const opportunities = await db.opportunity.findMany({
    where: { ownerId },
    include: { contacts: true, source: { select: { name: true } } },
  });

  let changed = 0;
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
        workspace: o.workspace,
        source: o.source,
      },
      { ...profile, calibration },
    );

    if (breakdown.total === o.matchScore) continue;

    await db.opportunity.update({
      where: { id: o.id },
      data: { matchScore: breakdown.total, scoreBreakdown: breakdown as object },
    });
    changed++;
  }

  return changed;
}
