import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { budgetValue } from "@/lib/utils";
import type { DashboardMetrics, OpportunityStatus, Workspace } from "@/lib/types";

// Dashboard aggregates — all scoped to a single owner + workspace so the DK and
// GLOBAL views stay strictly separated. Computed via Prisma count/groupBy/
// aggregate; no per-row work happens in JS beyond resolving source names.

const INACTIVE_STATUSES: OpportunityStatus[] = ["ARCHIVED", "LOST"];

export async function getDashboardMetrics(
  ownerId: string,
  workspace: Workspace,
): Promise<DashboardMetrics> {
  const scope = { ownerId, workspace } as const;
  // "Active" is derived from the deadline (no deadline, or not yet past) rather
  // than the stored isActive flag, which can drift stale between writes.
  const activeScope: Prisma.OpportunityWhereInput = {
    ...scope,
    status: { notIn: INACTIVE_STATUSES },
    OR: [{ deadline: null }, { deadline: { gte: new Date() } }],
  };

  const [
    newLeads,
    activeLeads,
    watchlistCount,
    appliedCount,
    wonCount,
    lostCount,
    upcomingDeadlinesRows,
    bestMatchesRows,
    pipelineAgg,
    sourceGroups,
    categoryGroups,
    statusGroups,
  ] = await Promise.all([
    db.opportunity.count({ where: { ...scope, status: "NEW" } }),
    db.opportunity.count({ where: activeScope }),
    db.watchlistItem.count({
      where: { ownerId, opportunity: { workspace } },
    }),
    db.opportunity.count({ where: { ...scope, status: "APPLIED" } }),
    db.opportunity.count({ where: { ...scope, status: "WON" } }),
    db.opportunity.count({ where: { ...scope, status: "LOST" } }),
    db.opportunity.findMany({
      where: { ...activeScope, deadline: { gte: new Date() } },
      orderBy: { deadline: "asc" },
      take: 10,
      select: { id: true, title: true, deadline: true, matchScore: true },
    }),
    db.opportunity.findMany({
      where: { ...scope, matchScore: { not: null } },
      orderBy: { matchScore: "desc" },
      take: 6,
      select: { id: true, title: true, matchScore: true },
    }),
    db.opportunity.aggregate({
      where: activeScope,
      _sum: { budgetMax: true, budgetMin: true },
    }),
    db.opportunity.groupBy({
      by: ["sourceId"],
      where: scope,
      _count: { _all: true },
    }),
    db.opportunity.groupBy({
      by: ["category"],
      where: scope,
      _count: { _all: true },
    }),
    db.opportunity.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
  ]);

  // Pipeline value: prefer summed max, fall back to summed min when max is null.
  const pipelineValue = budgetValue(pipelineAgg._sum.budgetMin, pipelineAgg._sum.budgetMax);

  // Resolve sourceId -> name for the bySource breakdown.
  const sourceIds = sourceGroups.map((g) => g.sourceId).filter((id): id is string => id != null);
  const sources = sourceIds.length
    ? await db.source.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, name: true },
      })
    : [];
  const sourceNameById = new Map(sources.map((s) => [s.id, s.name]));

  const bySource = sourceGroups
    .map((g) => ({
      source: g.sourceId ? sourceNameById.get(g.sourceId) ?? "Unknown source" : "Manual / no source",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const byCategory = categoryGroups
    .map((g) => ({ category: g.category ?? "Uncategorised", count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const byStatus = statusGroups
    .map((g) => ({ status: g.status as OpportunityStatus, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    newLeads,
    activeLeads,
    upcomingDeadlines: upcomingDeadlinesRows.map((o) => ({
      id: o.id,
      title: o.title,
      // The query filters deadline >= now, so it is always present here.
      deadline: o.deadline!.toISOString(),
      matchScore: o.matchScore,
    })),
    bestMatches: bestMatchesRows.map((o) => ({
      id: o.id,
      title: o.title,
      matchScore: o.matchScore,
    })),
    watchlistCount,
    appliedCount,
    wonCount,
    lostCount,
    pipelineValue,
    bySource,
    byCategory,
    byStatus,
  };
}
