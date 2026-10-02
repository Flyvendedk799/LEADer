import type { Deal, Opportunity, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { dedupeHash } from "@/lib/ingestion/dedupe";
import { scoreOpportunity } from "@/lib/scoring";
import { loadCalibration } from "@/lib/scoring/outcomes";
import type { DealStatus, ScoreWeights } from "@/lib/types";
import { confidenceScore, pursuitScore } from "./scoring";
import { dealStatusFromOpportunity, opportunityStatusFromDeal } from "./status";

type PromoteOptions = {
  /** When updating an existing deal, copy the opportunity status across. Creates always copy it. */
  syncStatus?: boolean;
};

function scoresFor(opportunity: Opportunity) {
  const confidence = confidenceScore({
    hasUrl: Boolean(opportunity.url),
    hasDeadline: Boolean(opportunity.deadline),
    hasBudget: opportunity.budgetMin != null || opportunity.budgetMax != null,
    hasOrganization: Boolean(opportunity.organization),
  });
  const pursuit = pursuitScore({
    matchScore: opportunity.matchScore,
    confidenceScore: confidence,
    deadline: opportunity.deadline,
    priority: opportunity.priority,
  });
  return { confidence, pursuit };
}

/**
 * Upsert the user-facing Deal for a scored Opportunity.
 * Opportunity stays the deduped ingest row; `legacyOpportunityId` is the link.
 */
export async function ensureDealForOpportunity(
  ownerId: string,
  opportunityId: string,
  options: PromoteOptions = {},
) {
  const opportunity = await db.opportunity.findFirst({
    where: { id: opportunityId, ownerId },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  const existing = await db.deal.findUnique({
    where: { legacyOpportunityId: opportunity.id },
  });
  if (existing && existing.ownerId !== ownerId)
    throw new Error("Opportunity not found");

  const { confidence, pursuit } = scoresFor(opportunity);
  const mappedStatus = dealStatusFromOpportunity(opportunity.status);

  if (existing) {
    return db.deal.update({
      where: { id: existing.id },
      data: {
        matchScore: opportunity.matchScore,
        confidenceScore: confidence,
        pursuitScore: pursuit,
        deadline: opportunity.deadline ?? existing.deadline,
        valueMin: opportunity.budgetMin ?? existing.valueMin,
        valueMax: opportunity.budgetMax ?? existing.valueMax,
        currency: opportunity.currency ?? existing.currency,
        url: existing.url || opportunity.url,
        summary:
          existing.summary || opportunity.aiSummary || opportunity.description,
        nextAction: existing.nextAction || opportunity.nextAction,
        ...(options.syncStatus ? { status: mappedStatus } : {}),
      },
    });
  }

  const accountName = opportunity.organization?.trim() || "Unknown account";
  const account = await db.account.upsert({
    where: { ownerId_name: { ownerId, name: accountName } },
    update: {
      website: opportunity.url || undefined,
      workspace: opportunity.workspace,
      fitScore: opportunity.matchScore ?? undefined,
    },
    create: {
      ownerId,
      name: accountName,
      website: opportunity.url || undefined,
      workspace: opportunity.workspace,
      type: "UNKNOWN",
      fitScore: opportunity.matchScore ?? undefined,
    },
  });

  return db.deal.create({
    data: {
      ownerId,
      accountId: account.id,
      sourceId: opportunity.sourceId,
      legacyOpportunityId: opportunity.id,
      title: opportunity.title,
      summary: opportunity.aiSummary || opportunity.description,
      rawContent: opportunity.rawContent,
      valueMin: opportunity.budgetMin,
      valueMax: opportunity.budgetMax,
      currency: opportunity.currency ?? "DKK",
      deadline: opportunity.deadline,
      status: mappedStatus,
      priority: opportunity.priority,
      workspace: opportunity.workspace,
      category: opportunity.category,
      applicationRoute: opportunity.applicationRoute,
      url: opportunity.url,
      matchScore: opportunity.matchScore,
      confidenceScore: confidence,
      pursuitScore: pursuit,
      nextAction:
        opportunity.nextAction || "Review this lead and decide the next step.",
    },
  });
}

/** Keep the linked opportunity status aligned when a deal moves. */
export async function syncLinkedOpportunityStatus(
  ownerId: string,
  dealId: string,
  status: DealStatus,
) {
  const deal = await db.deal.findFirst({
    where: { id: dealId, ownerId },
    select: { legacyOpportunityId: true },
  });
  if (!deal?.legacyOpportunityId) return;
  await db.opportunity.updateMany({
    where: { id: deal.legacyOpportunityId, ownerId },
    data: { status: opportunityStatusFromDeal(status) },
  });
}

/**
 * Manual deals still need a scored, deduped opportunity row so learning and
 * ingest can see them. Links the deal when the row already exists.
 */
export async function linkOpportunityForDeal(
  ownerId: string,
  dealId: string,
  client: Prisma.TransactionClient = db,
): Promise<Deal> {
  const deal = await client.deal.findFirst({
    where: { id: dealId, ownerId },
    include: { account: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.legacyOpportunityId) return deal;

  const organization = deal.account?.name;
  let hash = dedupeHash({
    title: deal.title,
    url: deal.url ?? undefined,
    organization: organization ?? undefined,
  });
  let existing = await client.opportunity.findUnique({
    where: { dedupeHash: hash },
  });
  if (existing) {
    const taken = await client.deal.findFirst({
      where: { legacyOpportunityId: existing.id, NOT: { id: deal.id } },
      select: { id: true },
    });
    if (existing.ownerId !== ownerId || taken) {
      hash = dedupeHash({
        title: `${deal.title} ${deal.id}`,
        organization: deal.id,
      });
      existing = null;
    }
  }

  const owner = await client.user.findUnique({
    where: { id: ownerId },
    select: { scoringWeights: true, budgetMaxDkk: true },
  });
  const breakdown = scoreOpportunity(
    {
      title: deal.title,
      description: deal.summary,
      rawContent: deal.rawContent,
      budgetMin: deal.valueMin,
      budgetMax: deal.valueMax,
      deadline: deal.deadline,
      organization,
      category: deal.category,
      applicationRoute: deal.applicationRoute,
    },
    {
      budgetMaxDkk: owner?.budgetMaxDkk ?? 100000,
      weights: (owner?.scoringWeights as Partial<ScoreWeights>) || undefined,
      calibration: await loadCalibration(ownerId),
    },
  );
  breakdown.computedAt = new Date().toISOString();
  const status = opportunityStatusFromDeal(deal.status);

  const opportunityId = existing
    ? existing.id
    : (
        await client.opportunity.create({
          data: {
            ownerId,
            sourceId: deal.sourceId,
            title: deal.title,
            description: deal.summary,
            rawContent: deal.rawContent,
            url: deal.url,
            organization,
            workspace: deal.workspace,
            category: deal.category,
            budgetMin: deal.valueMin,
            budgetMax: deal.valueMax,
            currency: deal.currency ?? "DKK",
            deadline: deal.deadline,
            isActive: !deal.deadline || deal.deadline.getTime() >= Date.now(),
            status,
            applicationRoute: deal.applicationRoute,
            priority: deal.priority,
            ingestMethod: "MANUAL",
            matchScore: deal.matchScore ?? breakdown.total,
            scoreBreakdown: breakdown as object,
            nextAction: deal.nextAction,
            dedupeHash: hash,
          },
        })
      ).id;

  if (existing) {
    await client.opportunity.update({
      where: { id: existing.id },
      data: {
        status,
        matchScore: deal.matchScore ?? existing.matchScore ?? breakdown.total,
        scoreBreakdown:
          (existing.scoreBreakdown as object) ?? (breakdown as object),
        nextAction: existing.nextAction || deal.nextAction,
      },
    });
  }

  return client.deal.update({
    where: { id: deal.id },
    data: {
      legacyOpportunityId: opportunityId,
      matchScore: deal.matchScore ?? breakdown.total,
    },
  });
}
