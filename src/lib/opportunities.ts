import { db } from "@/lib/db";
import type { OpportunityFilter, Paginated } from "@/lib/types";
import type { Prisma } from "@prisma/client";

// Shared opportunity querying — used by both the /api/opportunities route and
// server components so filter semantics stay identical everywhere.

export function buildWhere(ownerId: string, f: OpportunityFilter): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = { ownerId };
  const AND: Prisma.OpportunityWhereInput[] = [];

  if (f.workspace) where.workspace = f.workspace;
  if (f.q) {
    AND.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { description: { contains: f.q, mode: "insensitive" } },
        { organization: { contains: f.q, mode: "insensitive" } },
        { aiSummary: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (f.status?.length) where.status = { in: f.status as Prisma.EnumOpportunityStatusFilter["in"] };
  if (f.source?.length) where.sourceId = { in: f.source };
  if (f.category?.length) where.category = { in: f.category };
  if (f.country) where.country = f.country;
  if (f.region) where.region = f.region;
  if (f.applicationRoute?.length)
    where.applicationRoute = { in: f.applicationRoute as Prisma.EnumApplicationRouteFilter["in"] };
  if (f.ingestMethod?.length)
    where.ingestMethod = { in: f.ingestMethod as Prisma.EnumIngestMethodFilter["in"] };

  // "Active" = not past its deadline. Derive from the deadline directly rather
  // than the stored isActive flag, which can drift stale between writes.
  if (f.activeOnly) {
    AND.push({ OR: [{ deadline: null }, { deadline: { gte: new Date() } }] });
  }

  if (f.scoreMin != null || f.scoreMax != null) {
    where.matchScore = {};
    if (f.scoreMin != null) where.matchScore.gte = f.scoreMin;
    if (f.scoreMax != null) where.matchScore.lte = f.scoreMax;
  }

  if (f.budgetMin != null) AND.push({ budgetMax: { gte: f.budgetMin } });
  if (f.budgetMax != null) AND.push({ budgetMin: { lte: f.budgetMax } });

  if (f.hasBudget === true) AND.push({ OR: [{ budgetMin: { not: null } }, { budgetMax: { not: null } }] });
  if (f.hasBudget === false) AND.push({ budgetMin: null, budgetMax: null });

  if (f.deadlineFrom || f.deadlineTo) {
    where.deadline = {};
    if (f.deadlineFrom) where.deadline.gte = new Date(f.deadlineFrom);
    if (f.deadlineTo) where.deadline.lte = new Date(f.deadlineTo);
  }

  if (f.tags?.length) {
    AND.push({ tags: { some: { tag: { name: { in: f.tags } } } } });
  }

  if (AND.length) where.AND = AND;
  return where;
}

export function buildOrderBy(f: OpportunityFilter): Prisma.OpportunityOrderByWithRelationInput {
  const order = f.order || "desc";
  switch (f.sort) {
    case "deadline":
      return { deadline: order };
    case "created":
      return { createdAt: order };
    case "budget":
      return { budgetMax: order };
    case "score":
    default:
      return { matchScore: order };
  }
}

export const OPPORTUNITY_INCLUDE = {
  source: true,
  tags: { include: { tag: true } },
  contacts: true,
  _count: { select: { notes: true, drafts: true, attachments: true } },
} satisfies Prisma.OpportunityInclude;

/** The canonical list-row payload shared by tables/cards across all slices. */
export type OpportunityListItem = Prisma.OpportunityGetPayload<{
  include: typeof OPPORTUNITY_INCLUDE;
}>;

export async function listOpportunities(
  ownerId: string,
  f: OpportunityFilter,
): Promise<Paginated<Prisma.OpportunityGetPayload<{ include: typeof OPPORTUNITY_INCLUDE }>>> {
  const page = Math.max(1, f.page || 1);
  const pageSize = Math.min(100, Math.max(1, f.pageSize || 25));
  const where = buildWhere(ownerId, f);

  const [items, total] = await Promise.all([
    db.opportunity.findMany({
      where,
      orderBy: buildOrderBy(f),
      include: OPPORTUNITY_INCLUDE,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.opportunity.count({ where }),
  ]);

  return { items, total, page, pageSize };
}
