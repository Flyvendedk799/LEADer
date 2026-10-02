import { z } from "zod";
import { NextResponse } from "next/server";

import { assertOwnedLinks } from "@/lib/crm/ownership";
import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEAL_INCLUDE, listDeals } from "@/lib/crm";
import { linkOpportunityForDeal } from "@/lib/crm/promote";
import { pursuitScore } from "@/lib/crm/scoring";
import { dealCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const result = await listDeals(ownerId, new URL(req.url).searchParams);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = dealCreateSchema
      .extend({ organization: z.string().trim().max(200).optional() })
      .safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    await assertOwnedLinks(ownerId, parsed.data);
    const { organization, ...d } = parsed.data;
    if (d.valueMin != null && d.valueMax != null && d.valueMin > d.valueMax)
      return NextResponse.json(
        { error: "Minimum value must not exceed maximum value" },
        { status: 400 },
      );
    const created = await db.$transaction(
      async (tx) => {
        let accountId = d.accountId;
        if (!accountId && organization) {
          const account = await tx.account.upsert({
            where: { ownerId_name: { ownerId, name: organization } },
            update: {},
            create: { ownerId, name: organization, workspace: d.workspace },
          });
          accountId = account.id;
        }
        const deal = await tx.deal.create({
          data: {
            ownerId,
            ...d,
            accountId,
            url: d.url || undefined,
            pursuitScore:
              d.pursuitScore ??
              pursuitScore({
                matchScore: d.matchScore,
                confidenceScore: d.confidenceScore,
                deadline: d.deadline,
                priority: d.priority,
              }),
          },
        });
        return linkOpportunityForDeal(ownerId, deal.id, tx);
      },
      { timeout: 15000 },
    );
    const deal = await db.deal.findFirst({
      where: { id: created.id, ownerId },
      include: DEAL_INCLUDE,
    });
    return NextResponse.json(deal, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
