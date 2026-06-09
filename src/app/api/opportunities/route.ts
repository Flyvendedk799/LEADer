import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listOpportunities, OPPORTUNITY_INCLUDE } from "@/lib/opportunities";
import { opportunityCreateSchema, parseFilters } from "@/lib/validators";
import { dedupeHash } from "@/lib/ingestion/dedupe";
import { scoreOpportunity } from "@/lib/scoring";
import type { ScoreWeights } from "@/lib/types";

// GET /api/opportunities — paginated, filtered list (owner-scoped).
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const url = new URL(req.url);
    const filters = parseFilters(url.searchParams);
    const result = await listOpportunities(user.id, filters);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/opportunities — manual create + score (owner-scoped).
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = opportunityCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const breakdown = scoreOpportunity(
      {
        title: body.title,
        description: body.description,
        rawContent: body.rawContent,
        budgetMin: body.budgetMin ?? null,
        budgetMax: body.budgetMax ?? null,
        deadline: body.deadline ?? null,
        organization: body.organization,
        category: body.category,
        applicationRoute: body.applicationRoute,
        contacts: [],
      },
      {
        budgetMaxDkk: user.budgetMaxDkk,
        weights: (user.scoringWeights as Partial<ScoreWeights>) || undefined,
      },
    );
    breakdown.computedAt = new Date().toISOString();

    const isActive = !body.deadline || new Date(body.deadline).getTime() >= Date.now();

    const created = await db.opportunity.create({
      data: {
        ownerId: user.id,
        sourceId: body.sourceId || undefined,
        title: body.title,
        description: body.description,
        rawContent: body.rawContent,
        url: body.url || undefined,
        organization: body.organization,
        location: body.location,
        country: body.country,
        region: body.region,
        category: body.category,
        workspace: body.workspace,
        budgetMin: body.budgetMin,
        budgetMax: body.budgetMax,
        currency: body.currency,
        deadline: body.deadline ?? undefined,
        status: body.status,
        applicationRoute: body.applicationRoute,
        priority: body.priority,
        ingestMethod: "MANUAL",
        dedupeHash: dedupeHash({
          title: parsed.data.title,
          url: parsed.data.url || undefined,
          organization: parsed.data.organization,
          description: parsed.data.description,
        }),
        isActive,
        matchScore: breakdown.total,
        scoreBreakdown: breakdown as object,
        activities: { create: { type: "CREATED", message: "Created manually" } },
      },
      include: OPPORTUNITY_INCLUDE,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
