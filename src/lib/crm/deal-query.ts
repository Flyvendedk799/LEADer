import type { Prisma } from "@prisma/client";
import { DEAL_STATUSES, type DealStatus } from "@/lib/types";

export const OPEN_STATUSES: DealStatus[] = [
  "DISCOVERED",
  "QUALIFYING",
  "INTERESTING",
  "CONTACTED",
  "PROPOSAL",
  "NEGOTIATION",
];

function positiveInteger(raw: string | null, fallback: number, max: number) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, max)
    : fallback;
}

/** One validated query contract for the list, board and search API. */
export function dealQuery(
  ownerId: string,
  params: URLSearchParams,
  now = new Date(),
) {
  const statuses = params
    .getAll("status")
    .flatMap((v) => v.split(","))
    .filter((v): v is DealStatus => DEAL_STATUSES.includes(v as DealStatus));
  const where: Prisma.DealWhereInput = { ownerId };
  const workspace = params.get("workspace");
  if (workspace === "DK" || workspace === "GLOBAL") where.workspace = workspace;
  if (statuses.length) where.status = { in: statuses };
  else if (params.get("scope") !== "all") where.status = { in: OPEN_STATUSES };
  const q = params.get("q")?.trim();
  if (q)
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { account: { name: { contains: q, mode: "insensitive" } } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  if (params.get("attention") === "no-action")
    where.AND = [{ OR: [{ nextAction: null }, { nextAction: "" }] }];
  if (params.get("attention") === "stale")
    where.updatedAt = { lt: new Date(now.getTime() - 14 * 86400000) };
  if (params.get("attention") === "deadline")
    where.deadline = { gte: now, lte: new Date(now.getTime() + 7 * 86400000) };
  const sorts: Record<string, Prisma.DealOrderByWithRelationInput[]> = {
    score: [{ pursuitScore: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    recent: [{ updatedAt: "desc" }, { id: "asc" }],
    deadline: [{ deadline: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    value: [{ valueMax: { sort: "desc", nulls: "last" } }, { id: "asc" }],
  };
  return {
    where,
    orderBy: sorts[params.get("sort") || "score"] || sorts.score,
    page: positiveInteger(params.get("page"), 1, 100000),
    pageSize: positiveInteger(params.get("pageSize"), 25, 100),
  };
}
