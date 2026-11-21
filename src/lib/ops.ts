import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { companyProfile } from "@/lib/company-profile";
import { discoveryProviderReadiness } from "@/lib/discovery";
import { hasLlm } from "@/lib/ai/provider";
import { usagePeriods } from "@/lib/jobs/usage";

// Read models for operators and agents: one call that answers "is LEADer
// healthy, what is it spending, what did it find and what failed?".

const tail = (log: string[] | null | undefined, n: number) => (log ?? []).slice(-n);

export async function opsOverview(user: { id: string; aiKeys: unknown; companyProfile: unknown }) {
  const ownerId = user.id;
  const { day, month } = usagePeriods();
  const profile = companyProfile(user.companyProfile);
  const [worker, daily, monthly, missionStatus, candidateStatus, lanes, missions, workflows, sources, openTasks, deals] = await Promise.all([
    db.workerHeartbeat.findMany({ orderBy: { updatedAt: "desc" }, take: 3 }),
    db.providerUsage.groupBy({ by: ["kind"], where: { ownerId, createdAt: { gte: day } }, _sum: { units: true, reservedUsd: true } }),
    db.providerUsage.groupBy({ by: ["kind"], where: { ownerId, createdAt: { gte: month } }, _sum: { units: true, reservedUsd: true } }),
    db.discoveryMission.groupBy({ by: ["status"], where: { ownerId }, _count: { _all: true } }),
    db.discoveryCandidate.groupBy({ by: ["status"], where: { ownerId }, _count: { _all: true } }),
    db.discoveryLane.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, active: true, workspace: true, _count: { select: { candidates: true, missions: true } } },
    }),
    db.discoveryMission.findMany({
      where: { ownerId },
      orderBy: { startedAt: "desc" },
      take: 15,
      select: {
        id: true, status: true, provider: true, workspace: true, query: true, startedAt: true, finishedAt: true, attempts: true,
        warnings: true, log: true, lane: { select: { slug: true } }, _count: { select: { candidates: true } },
      },
    }),
    db.workflowRun.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, playbook: true, trigger: true, status: true, createdAt: true, finishedAt: true, log: true },
    }),
    db.source.findMany({
      where: { ownerId },
      select: {
        id: true, name: true, type: true, url: true, enabled: true, lastCheckedAt: true,
        discoveryRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, startedAt: true, foundCount: true, newCount: true, log: true } },
      },
    }),
    db.task.count({ where: { ownerId, status: "OPEN" } }),
    db.deal.groupBy({ by: ["status"], where: { ownerId }, _count: { _all: true } }),
  ]);
  const used = (rows: typeof daily, kind: string) => rows.find((r) => r.kind === kind)?._sum.units ?? 0;
  const heartbeat = worker[0]?.updatedAt ?? null;
  return {
    generatedAt: new Date().toISOString(),
    worker: { up: Boolean(heartbeat && Date.now() - heartbeat.getTime() < 60_000), lastHeartbeat: heartbeat, instances: worker },
    providers: { search: discoveryProviderReadiness(user.aiKeys as never), ai: hasLlm(user.aiKeys as never) },
    budget: {
      search: { today: used(daily, "SEARCH"), dailyLimit: profile.dailySearchQueries, month: used(monthly, "SEARCH"), monthlyLimit: profile.monthlySearchQueries },
      ai: { today: used(daily, "AI"), dailyLimit: profile.dailyAiCalls, month: used(monthly, "AI"), monthlyLimit: profile.monthlyAiCalls },
      reservedUsd: {
        today: daily.reduce((s, r) => s + Number(r._sum.reservedUsd ?? 0), 0),
        dailyLimit: profile.dailyBudgetUsd,
        month: monthly.reduce((s, r) => s + Number(r._sum.reservedUsd ?? 0), 0),
        monthlyLimit: profile.monthlyBudgetUsd,
      },
    },
    companyProfile: profile,
    counts: {
      missions: Object.fromEntries(missionStatus.map((r) => [r.status, r._count._all])),
      candidates: Object.fromEntries(candidateStatus.map((r) => [r.status, r._count._all])),
      deals: Object.fromEntries(deals.map((r) => [r.status, r._count._all])),
      openTasks,
    },
    lanes: lanes.map(({ _count, ...lane }) => ({ ...lane, candidates: _count.candidates, missions: _count.missions })),
    recentMissions: missions.map(({ log, lane, _count, ...m }) => ({ ...m, lane: lane?.slug, candidates: _count.candidates, logTail: tail(log, 6) })),
    recentWorkflows: workflows.map(({ log, ...w }) => ({ ...w, logTail: tail(log, 6) })),
    sources: sources.map(({ discoveryRuns, ...s }) => ({ ...s, lastRun: discoveryRuns[0] ? { ...discoveryRuns[0], log: discoveryRuns[0].log?.slice(-600) ?? null } : null })),
  };
}

export interface CandidateQuery {
  status?: string[];
  laneId?: string;
  laneSlug?: string;
  missionId?: string;
  q?: string;
  minScore?: number;
  workspace?: string;
  sort?: "score" | "recent";
  limit?: number;
  offset?: number;
}

export function candidateQueryFromParams(sp: URLSearchParams): CandidateQuery {
  const num = (k: string) => (sp.get(k) != null && Number.isFinite(Number(sp.get(k))) ? Number(sp.get(k)) : undefined);
  return {
    status: sp.get("status")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    laneId: sp.get("laneId") ?? undefined,
    laneSlug: sp.get("lane") ?? undefined,
    missionId: sp.get("missionId") ?? undefined,
    q: sp.get("q")?.trim() || undefined,
    minScore: num("minScore"),
    workspace: sp.get("workspace") ?? undefined,
    sort: sp.get("sort") === "recent" ? "recent" : "score",
    limit: num("limit"),
    offset: num("offset"),
  };
}

export async function listCandidates(ownerId: string, query: CandidateQuery) {
  const where: Prisma.DiscoveryCandidateWhereInput = { ownerId };
  if (query.status?.length) where.status = { in: query.status as never };
  if (query.laneId) where.laneId = query.laneId;
  if (query.laneSlug) where.lane = { slug: query.laneSlug };
  if (query.missionId) where.missionId = query.missionId;
  if (query.workspace === "DK" || query.workspace === "GLOBAL") where.workspace = query.workspace;
  if (query.minScore != null) where.pursuitScore = { gte: query.minScore };
  if (query.q) {
    where.OR = ["title", "description", "organization", "url", "sourceName"].map((field) => ({
      [field]: { contains: query.q, mode: "insensitive" },
    }));
  }
  const take = Math.min(200, Math.max(1, query.limit ?? 50));
  const [total, rows] = await Promise.all([
    db.discoveryCandidate.count({ where }),
    db.discoveryCandidate.findMany({
      where,
      take,
      skip: Math.max(0, query.offset ?? 0),
      orderBy: query.sort === "recent" ? [{ createdAt: "desc" }] : [{ pursuitScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true, title: true, status: true, url: true, organization: true, sourceName: true, sourceKind: true, provider: true,
        category: true, workspace: true, budgetMin: true, budgetMax: true, currency: true, deadline: true, applicationRoute: true,
        matchScore: true, confidenceScore: true, pursuitScore: true, reasons: true, signals: true, dismissalReason: true,
        missionId: true, dealId: true, createdAt: true, lane: { select: { slug: true } }, _count: { select: { evidence: true } },
        description: true,
      },
    }),
  ]);
  return {
    total,
    offset: query.offset ?? 0,
    candidates: rows.map(({ lane, _count, description, ...c }) => ({
      ...c,
      lane: lane?.slug ?? null,
      evidenceCount: _count.evidence,
      summary: description ? description.slice(0, 280) : null,
    })),
  };
}

export async function getCandidate(ownerId: string, id: string) {
  return db.discoveryCandidate.findFirst({
    where: { id, ownerId },
    include: {
      lane: { select: { id: true, slug: true, name: true } },
      mission: { select: { id: true, status: true, query: true, provider: true, startedAt: true } },
      evidence: { orderBy: { createdAt: "asc" } },
      deal: { select: { id: true, title: true, status: true } },
      account: { select: { id: true, name: true } },
    },
  });
}
