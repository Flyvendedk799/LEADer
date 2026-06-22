import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { runAi } from "@/lib/ai";
import { runDiscoverySearch, type DiscoveryCandidateDto } from "@/lib/discovery";
import { discoveryCountLabel, discoveryLogEntry, formatDiscoveryElapsed } from "@/lib/crm/discovery-logging";
import {
  ensureDefaultDiscoveryLanes,
  laneCandidateGate,
  laneFit,
  laneMissionQueries,
  missionQuery,
  type LaneFitResult,
} from "@/lib/crm/lanes";
import { confidenceScore, pursuitScore } from "@/lib/crm/scoring";
import type { AccountType, DealStatus, DiscoveryAiSearchPlan, DiscoverySearchMode, Workspace } from "@/lib/types";

const OPEN_DEAL_STATUSES: DealStatus[] = [
  "DISCOVERED",
  "QUALIFYING",
  "INTERESTING",
  "CONTACTED",
  "PROPOSAL",
  "NEGOTIATION",
];

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

type MissionLane = {
  id: string;
  slug: string;
  name: string;
  description: string;
  workspace: Workspace;
  sourceTypes: string[];
  queryTemplates: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  evidenceRequirements: string[];
  conversionGuidance?: string | null;
};

export type DiscoveryMissionInput = {
  laneId: string;
  query?: string;
  freeformBrief?: string;
  useAiPlanner?: boolean;
  searchMode?: DiscoverySearchMode;
  queryCount?: number;
  requiredTerms?: string[];
  excludedTerms?: string[];
  workspace?: Workspace;
  maxResults: number;
  includeWeb: boolean;
  includeSources: boolean;
  provider: "auto" | "tavily" | "brave" | "serper" | "none";
};

export const DEAL_INCLUDE = {
  account: true,
  lane: true,
  evidence: { orderBy: { createdAt: "desc" as const }, take: 5 },
  tasks: { orderBy: [{ status: "asc" as const }, { dueAt: "asc" as const }], take: 8 },
  conversionAssets: { orderBy: { createdAt: "desc" as const }, take: 5 },
  touchpoints: { orderBy: { occurredAt: "desc" as const }, take: 8 },
  people: { include: { person: true } },
} satisfies Prisma.DealInclude;

export type DealWithRelations = Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDE }>;

const DISCOVERY_MISSION_INCLUDE = {
  lane: true,
  candidates: {
    include: { evidence: true, deal: true, account: true },
    orderBy: [{ pursuitScore: "desc" as const }, { createdAt: "desc" as const }],
  },
} satisfies Prisma.DiscoveryMissionInclude;

type PreparedDiscoveryMission = {
  lane: MissionLane;
  workspace: Workspace;
  plan?: DiscoveryAiSearchPlan;
  queries: string[];
  query: string;
  requiredTerms: string[];
  excludedTerms: string[];
  scoringLane: MissionLane;
};

type LaneFilteredDiscoveryCandidates = {
  candidates: DiscoveryCandidateDto[];
  removed: number;
  reasons: string[];
};

function clean(value?: string | null, fallback = "Unknown account") {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function missionSurfaces(input: Pick<DiscoveryMissionInput, "includeWeb" | "includeSources">) {
  return [
    input.includeWeb ? "web" : "",
    input.includeSources ? "sources" : "",
  ].filter(Boolean).join(" + ") || "none";
}

function host(url?: string | null) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function accountTypeFrom(input: { organization?: string | null; category?: string | null; sourceKind?: string | null; laneSlug?: string | null }): AccountType {
  const text = `${input.organization ?? ""} ${input.category ?? ""} ${input.laneSlug ?? ""}`.toLowerCase();
  if (input.sourceKind === "community" || text.includes("community") || text.includes("facebook")) return "COMMUNITY";
  if (text.includes("tender") || text.includes("procurement") || text.includes("udbud")) return "PUBLIC_BUYER";
  if (text.includes("startup") || text.includes("mvp") || text.includes("accelerator")) return "STARTUP";
  return "COMPANY";
}

function dateOrUndefined(value?: string | Date | null) {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function cleanTerm(value?: string | null, max = 80) {
  return value?.replace(/\s+/g, " ").trim().slice(0, max) || "";
}

function cleanTerms(values: string[] = [], limit = 12, maxLength = 80) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanTerm(value, maxLength);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function queryLimitForMode(mode: DiscoverySearchMode = "balanced", explicit?: number) {
  if (explicit) return explicit;
  if (mode === "focused") return 3;
  if (mode === "wide") return 7;
  return 5;
}

function profileString(user: {
  headline?: string | null;
  bio?: string | null;
  preferredProjectTypes?: string[];
}) {
  return [
    user.headline,
    user.bio,
    user.preferredProjectTypes?.length ? `Preferred project types: ${user.preferredProjectTypes.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n") || undefined;
}

function filterCandidatesForLane(
  lane: Pick<MissionLane, "slug" | "name" | "queryTemplates" | "positiveKeywords" | "negativeKeywords" | "evidenceRequirements">,
  candidates: DiscoveryCandidateDto[],
): LaneFilteredDiscoveryCandidates {
  const reasonCounts = new Map<string, number>();
  const filtered: DiscoveryCandidateDto[] = [];

  for (const candidate of candidates) {
    const gate = laneCandidateGate(lane, candidate);
    if (gate.allowed) {
      filtered.push(candidate);
      continue;
    }
    const reason = gate.reason ?? "lane guard";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const reasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${reason}`);

  return {
    candidates: filtered,
    removed: candidates.length - filtered.length,
    reasons,
  };
}

function parsePlanData(data: unknown): DiscoveryAiSearchPlan | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const arrayOfStrings = (value: unknown, limit: number) =>
    Array.isArray(value) ? cleanTerms(value.filter((item): item is string => typeof item === "string"), limit) : [];

  const queries = arrayOfStrings(record.queries, 8);
  if (!queries.length) return undefined;
  const confidence = typeof record.confidence === "number" ? clampScore(record.confidence) : 50;
  return {
    summary: typeof record.summary === "string" ? cleanTerm(record.summary, 320) : "AI generated discovery plan",
    queries,
    requiredTerms: arrayOfStrings(record.requiredTerms, 8),
    excludedTerms: arrayOfStrings(record.excludedTerms, 8),
    positiveKeywords: arrayOfStrings(record.positiveKeywords, 10),
    evidenceRequirements: arrayOfStrings(record.evidenceRequirements, 6),
    suggestedLaneSlug: typeof record.suggestedLaneSlug === "string" ? cleanTerm(record.suggestedLaneSlug, 80) : undefined,
    confidence,
    notes: arrayOfStrings(record.notes, 5),
  };
}

async function planDiscoverySearch(
  ownerId: string,
  lane: MissionLane,
  input: {
    query?: string;
    freeformBrief?: string;
    searchMode?: DiscoverySearchMode;
    requiredTerms?: string[];
    excludedTerms?: string[];
  },
  workspace: Workspace,
) {
  const freeform = cleanTerm(input.freeformBrief || input.query, 1200);
  if (!freeform) return undefined;

  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: {
      headline: true,
      bio: true,
      preferredProjectTypes: true,
      aiKeys: true,
    },
  });

  const context = [
    `Freeform brief:\n${freeform}`,
    `Selected lane: ${lane.name} (${lane.slug})`,
    `Lane description: ${lane.description}`,
    `Workspace: ${workspace}`,
    `Search mode: ${input.searchMode ?? "balanced"}`,
    `Lane query templates: ${lane.queryTemplates.join(" | ")}`,
    `Lane positive keywords: ${lane.positiveKeywords.join(", ")}`,
    `Lane negative keywords: ${lane.negativeKeywords.join(", ")}`,
    `Lane evidence requirements: ${lane.evidenceRequirements.join(", ")}`,
    input.requiredTerms?.length ? `User must include terms: ${input.requiredTerms.join(", ")}` : "",
    input.excludedTerms?.length ? `User excluded terms: ${input.excludedTerms.join(", ")}` : "",
  ].filter(Boolean).join("\n\n");

  const result = await runAi({
    action: "planDiscoverySearch",
    context,
    profile: user ? profileString(user) : undefined,
    aiKeys: user?.aiKeys,
  });
  const plan = parsePlanData(result.data);
  if (!plan) return undefined;
  return {
    ...plan,
    notes: [
      ...plan.notes,
      result.mocked ? "AI planner used deterministic mock output." : `AI planner used ${result.model}.`,
    ].slice(0, 6),
  };
}

export async function ensureAccount(ownerId: string, input: {
  name?: string | null;
  website?: string | null;
  country?: string | null;
  region?: string | null;
  workspace?: Workspace;
  type?: AccountType;
  source?: string | null;
  fitScore?: number | null;
}) {
  const name = clean(input.name || host(input.website), "Unknown account");
  return db.account.upsert({
    where: { ownerId_name: { ownerId, name } },
    update: {
      website: input.website || undefined,
      domain: host(input.website),
      country: input.country || undefined,
      region: input.region || undefined,
      workspace: input.workspace ?? "DK",
      type: input.type ?? "UNKNOWN",
      source: input.source || undefined,
      fitScore: input.fitScore ?? undefined,
    },
    create: {
      ownerId,
      name,
      website: input.website || undefined,
      domain: host(input.website),
      country: input.country || undefined,
      region: input.region || undefined,
      workspace: input.workspace ?? "DK",
      type: input.type ?? "UNKNOWN",
      source: input.source || undefined,
      fitScore: input.fitScore ?? undefined,
    },
  });
}

export async function listDeals(ownerId: string, params: URLSearchParams) {
  const workspace = params.get("workspace") === "GLOBAL" ? "GLOBAL" : params.get("workspace") === "DK" ? "DK" : undefined;
  const status = params.getAll("status").flatMap((v) => v.split(",")).filter(Boolean) as DealStatus[];
  const q = params.get("q")?.trim();
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || 25)));

  const where: Prisma.DealWhereInput = { ownerId };
  if (workspace) where.workspace = workspace;
  if (status.length) where.status = { in: status as Prisma.EnumDealStatusFilter["in"] };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { account: { name: { contains: q, mode: "insensitive" } } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    db.deal.findMany({
      where,
      include: DEAL_INCLUDE,
      orderBy: [{ pursuitScore: "desc" }, { deadline: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.deal.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getCockpit(ownerId: string, workspace: Workspace = "DK") {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - 14 * 86400000);

  const [
    openDeals,
    wonDeals,
    lostDeals,
    hotCandidates,
    overdueTasks,
    dueTasks,
    upcomingDeadlines,
    staleDeals,
    pipelineValue,
    statusGroups,
  ] = await Promise.all([
    db.deal.count({ where: { ownerId, workspace, status: { in: OPEN_DEAL_STATUSES } } }),
    db.deal.count({ where: { ownerId, workspace, status: "WON" } }),
    db.deal.count({ where: { ownerId, workspace, status: "LOST" } }),
    db.discoveryCandidate.findMany({
      where: { ownerId, workspace, status: "NEW", pursuitScore: { gte: 70 } },
      include: { lane: true, evidence: { take: 1, orderBy: { createdAt: "desc" } } },
      orderBy: { pursuitScore: "desc" },
      take: 8,
    }),
    db.task.findMany({
      where: { ownerId, status: "OPEN", dueAt: { lt: now }, deal: { workspace } },
      include: { deal: { include: { account: true } } },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    db.task.findMany({
      where: {
        ownerId,
        status: "OPEN",
        dueAt: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) },
        deal: { workspace },
      },
      include: { deal: { include: { account: true } } },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    db.deal.findMany({
      where: { ownerId, workspace, status: { in: OPEN_DEAL_STATUSES }, deadline: { gte: now } },
      include: { account: true },
      orderBy: { deadline: "asc" },
      take: 8,
    }),
    db.deal.findMany({
      where: { ownerId, workspace, status: { in: OPEN_DEAL_STATUSES }, updatedAt: { lt: staleCutoff } },
      include: { account: true },
      orderBy: { updatedAt: "asc" },
      take: 8,
    }),
    db.deal.aggregate({
      where: { ownerId, workspace, status: { in: OPEN_DEAL_STATUSES } },
      _sum: { valueMax: true, valueMin: true },
    }),
    db.deal.groupBy({
      by: ["status"],
      where: { ownerId, workspace },
      _count: { _all: true },
    }),
  ]);

  return {
    openDeals,
    wonDeals,
    lostDeals,
    hotCandidates,
    overdueTasks,
    dueTasks,
    upcomingDeadlines,
    staleDeals,
    pipelineValue: pipelineValue._sum.valueMax ?? pipelineValue._sum.valueMin ?? 0,
    byStatus: statusGroups.map((group) => ({ status: group.status as DealStatus, count: group._count._all })),
  };
}

async function prepareDiscoveryMission(
  ownerId: string,
  input: DiscoveryMissionInput,
): Promise<PreparedDiscoveryMission> {
  await ensureDefaultDiscoveryLanes(ownerId);
  const lane = await db.discoveryLane.findFirst({ where: { id: input.laneId, ownerId } });
  if (!lane) throw new Error("Discovery lane not found");

  const workspace = input.workspace ?? (lane.workspace as Workspace);
  const queryCount = queryLimitForMode(input.searchMode, input.queryCount);
  const plan = input.useAiPlanner
    ? await planDiscoverySearch(ownerId, lane as MissionLane, input, workspace)
    : undefined;
  const focus = cleanTerm(input.query || input.freeformBrief, 500);
  const laneQueries = laneMissionQueries(lane, focus, queryCount);
  const planQueries = plan?.queries ?? [];
  const querySeeds = lane.slug === "tenders-procurement"
    ? [...laneQueries, ...planQueries]
    : [...planQueries, ...laneQueries];
  const queries = cleanTerms([
    ...querySeeds,
    ...(focus ? [`${focus} ${lane.positiveKeywords.slice(0, 5).join(" ")}`] : []),
  ], queryCount, 360);
  const query = queries[0] || missionQuery(lane, input.query);
  const requiredTerms = cleanTerms(input.requiredTerms, 12);
  const excludedTerms = cleanTerms([...(input.excludedTerms ?? []), ...(plan?.excludedTerms ?? [])], 12);
  const scoringLane: MissionLane = {
    ...(lane as MissionLane),
    positiveKeywords: cleanTerms([...(lane.positiveKeywords ?? []), ...(plan?.positiveKeywords ?? [])], 24),
    negativeKeywords: cleanTerms([...(lane.negativeKeywords ?? []), ...excludedTerms], 24),
    evidenceRequirements: cleanTerms([...(lane.evidenceRequirements ?? []), ...(plan?.evidenceRequirements ?? [])], 12, 140),
  };

  return {
    lane: lane as MissionLane,
    workspace,
    plan,
    queries,
    query,
    requiredTerms,
    excludedTerms,
    scoringLane,
  };
}

export async function createDiscoveryMission(
  ownerId: string,
  input: DiscoveryMissionInput,
  status = "QUEUED",
) {
  await ensureDefaultDiscoveryLanes(ownerId);
  const lane = await db.discoveryLane.findFirst({ where: { id: input.laneId, ownerId } });
  if (!lane) throw new Error("Discovery lane not found");

  const workspace = input.workspace ?? (lane.workspace as Workspace);
  const queryCount = queryLimitForMode(input.searchMode, input.queryCount);
  const focus = cleanTerm(input.query || input.freeformBrief, 500);
  const queries = cleanTerms([
    ...laneMissionQueries(lane, focus, queryCount),
    ...(focus ? [`${focus} ${lane.positiveKeywords.slice(0, 5).join(" ")}`] : []),
  ], queryCount, 360);

  return db.discoveryMission.create({
    data: {
      ownerId,
      laneId: lane.id,
      query: queries.join("\n") || missionQuery(lane, input.query),
      input: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
      workspace,
      provider: input.provider,
      status,
      log: [
        discoveryLogEntry(
          `${status === "RUNNING" ? "Started" : "Queued"} ${input.searchMode ?? "balanced"} mission for ${missionSurfaces(input)} using ${input.provider}.`,
        ),
        ...(input.useAiPlanner ? [discoveryLogEntry("AI query planner requested.")] : []),
      ],
    },
    include: DISCOVERY_MISSION_INCLUDE,
  });
}

export async function executeDiscoveryMission(
  ownerId: string,
  missionId: string,
  input: DiscoveryMissionInput,
) {
  const workerStartedAt = Date.now();
  const missionWhere = { id: missionId, ownerId };
  const isCanceled = async () => {
    const mission = await db.discoveryMission.findFirst({
      where: missionWhere,
      select: { status: true },
    });
    return mission?.status === "CANCELED";
  };
  const canceledMission = () =>
    db.discoveryMission.findFirstOrThrow({
      where: missionWhere,
      include: DISCOVERY_MISSION_INCLUDE,
    });
  const appendLog = async (message: string, options: { allowCanceled?: boolean } = {}) => {
    const data = { log: { push: discoveryLogEntry(message) } };
    if (options.allowCanceled) {
      await db.discoveryMission.update({ where: { id: missionId }, data }).catch(() => {});
      return;
    }
    await db.discoveryMission.updateMany({
      where: { ...missionWhere, status: { not: "CANCELED" } },
      data,
    }).catch(() => {});
  };

  try {
    const started = await db.discoveryMission.updateMany({
      where: { ...missionWhere, status: { not: "CANCELED" } },
      data: {
        status: "RUNNING",
        finishedAt: null,
        warnings: [],
        sourceScanCount: 0,
        provider: input.provider,
        log: { push: discoveryLogEntry("Worker started mission and is preparing probes.") },
      },
    });
    if (started.count === 0) {
      await appendLog("Worker skipped mission because it was canceled before start.", { allowCanceled: true });
      const canceled = await canceledMission();
      return { mission: canceled, candidates: [] };
    }
    const prepareStartedAt = Date.now();
    await appendLog(
      input.useAiPlanner
        ? "Planning search probes with AI; wide missions can take a few minutes."
        : "Compiling lane search probes without AI planning.",
    );
    const prepared = await prepareDiscoveryMission(ownerId, input);
    const prepareMs = Date.now() - prepareStartedAt;
    const preparedUpdate = await db.discoveryMission.updateMany({
      where: { ...missionWhere, status: { not: "CANCELED" } },
      data: {
        status: "RUNNING",
        finishedAt: null,
        warnings: [],
        sourceScanCount: 0,
        query: prepared.queries.join("\n"),
        workspace: prepared.workspace,
        provider: input.provider,
        log: {
          push: discoveryLogEntry(
            `Prepared ${discoveryCountLabel(prepared.queries.length, "probe")}${prepared.plan ? " with AI planner" : ""} in ${formatDiscoveryElapsed(prepareMs)}.`,
          ),
        },
      },
    });
    if (preparedUpdate.count === 0) {
      await appendLog("Mission stopped after cancellation during probe preparation.", { allowCanceled: true });
      const canceled = await canceledMission();
      return { mission: canceled, candidates: [] };
    }

    const phaseStartedAt = Date.now();
    const result = await runDiscoverySearch(ownerId, {
      query: cleanTerm(input.query || input.freeformBrief, 500) || prepared.query,
      queryVariants: prepared.queries,
      requiredTerms: prepared.requiredTerms,
      excludedTerms: prepared.excludedTerms,
      workspace: prepared.workspace,
      maxResults: input.maxResults,
      includeWeb: input.includeWeb,
      includeSources: input.includeSources,
      provider: input.provider,
      resultKind: prepared.lane.slug === "tenders-procurement" ? "opportunities" : undefined,
      useAiPlanner: input.useAiPlanner !== false && !prepared.plan,
      onProgress: appendLog,
    });
    const laneFiltered = filterCandidatesForLane(prepared.scoringLane, result.candidates);
    const searchMs = Date.now() - phaseStartedAt;
    if (laneFiltered.removed > 0) {
      await appendLog(
        `${prepared.lane.name} lane guard hid ${discoveryCountLabel(laneFiltered.removed, "candidate")}: ${laneFiltered.reasons.slice(0, 3).join("; ")}.`,
      );
    }
    await db.discoveryMission.updateMany({
      where: { ...missionWhere, status: { not: "CANCELED" } },
      data: {
        log: {
          push: discoveryLogEntry(
            `Search returned ${discoveryCountLabel(laneFiltered.candidates.length, "candidate")} from ${result.provider}; scanned ${discoveryCountLabel(result.sourceScanCount, "source")} in ${formatDiscoveryElapsed(searchMs)}.`,
          ),
        },
      },
    });
    const warnings = [
      ...result.warnings,
      ...(laneFiltered.removed > 0
        ? [
            `${prepared.lane.name} lane guard hid ${discoveryCountLabel(laneFiltered.removed, "candidate")}: ${laneFiltered.reasons.slice(0, 3).join("; ")}.`,
          ]
        : []),
    ];
    if (searchMs > 90_000) {
      warnings.push(`Discovery network phase took ${Math.round(searchMs / 1000)}s.`);
    }

    if (await isCanceled()) {
      await appendLog("Mission finished after cancellation; search results were discarded.", { allowCanceled: true });
      const canceled = await canceledMission();
      return {
        mission: canceled,
        providerConfigured: result.providerConfigured,
        queries: result.queries,
        plan: prepared.plan,
        candidates: [],
      };
    }

    const candidates = [];
    const persistStartedAt = Date.now();
    await appendLog(`Saving ${discoveryCountLabel(laneFiltered.candidates.length, "candidate")} to the review queue.`);
    for (const candidate of laneFiltered.candidates) {
      if (await isCanceled()) {
        await appendLog(
          "Mission stopped after cancellation during save; remaining search results were not saved.",
          { allowCanceled: true },
        );
        const canceled = await canceledMission();
        return {
          mission: canceled,
          providerConfigured: result.providerConfigured,
          queries: result.queries,
          plan: prepared.plan,
          candidates,
        };
      }
      candidates.push(await persistCandidate(ownerId, missionId, prepared.scoringLane, candidate));
    }
    const persistMs = Date.now() - persistStartedAt;

    const finished = await db.discoveryMission.updateMany({
      where: { ...missionWhere, status: { not: "CANCELED" } },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        warnings,
        sourceScanCount: result.sourceScanCount,
        provider: result.provider,
        log: {
          push: discoveryLogEntry(
            `Saved ${discoveryCountLabel(candidates.length, "candidate")} in ${formatDiscoveryElapsed(persistMs)}; mission complete after ${formatDiscoveryElapsed(Date.now() - workerStartedAt)}.`,
          ),
        },
      },
    });
    if (finished.count === 0) {
      await appendLog("Mission stopped after cancellation before completion was recorded.", { allowCanceled: true });
      const canceled = await canceledMission();
      return {
        mission: canceled,
        providerConfigured: result.providerConfigured,
        queries: result.queries,
        plan: prepared.plan,
        candidates,
      };
    }

    const updated = await db.discoveryMission.findFirstOrThrow({
      where: missionWhere,
      include: DISCOVERY_MISSION_INCLUDE,
    });

    return {
      mission: updated,
      providerConfigured: result.providerConfigured,
      queries: result.queries,
      plan: prepared.plan,
      candidates,
    };
  } catch (error) {
    if (await isCanceled()) {
      await appendLog("Mission stopped after cancellation.", { allowCanceled: true });
      const canceled = await canceledMission();
      return { mission: canceled, candidates: [] };
    }
    await db.discoveryMission.updateMany({
      where: { ...missionWhere, status: { not: "CANCELED" } },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        warnings: [error instanceof Error ? error.message : "Discovery failed"],
        log: {
          push: discoveryLogEntry(
            `Mission failed after ${formatDiscoveryElapsed(Date.now() - workerStartedAt)}: ${error instanceof Error ? error.message : "Discovery failed"}`,
          ),
        },
      },
    }).catch(() => {});
    throw error;
  }
}

export async function runDiscoveryMission(ownerId: string, input: DiscoveryMissionInput) {
  const mission = await createDiscoveryMission(ownerId, input, "RUNNING");
  return executeDiscoveryMission(ownerId, mission.id, input);
}

function laneFitMetadata(fit: LaneFitResult) {
  return {
    delta: fit.delta,
    confidenceBonus: fit.confidenceBonus,
    priority: fit.priority,
    matchedKeywords: fit.matchedKeywords,
    blockedKeywords: fit.blockedKeywords,
    evidenceMatches: fit.evidenceMatches,
    missingEvidence: fit.missingEvidence,
  };
}

async function persistCandidate(
  ownerId: string,
  missionId: string,
  lane: {
    id: string;
    slug: string;
    name: string;
    queryTemplates: string[];
    positiveKeywords: string[];
    negativeKeywords: string[];
    evidenceRequirements: string[];
  },
  candidate: DiscoveryCandidateDto,
) {
  const fit = laneFit(lane, candidate);
  const matchScore = clampScore((candidate.matchScore ?? 50) + fit.delta);
  const confidence = clampScore(confidenceScore({
    hasUrl: Boolean(candidate.url),
    hasDeadline: Boolean(candidate.deadline),
    hasBudget: candidate.budgetMin != null || candidate.budgetMax != null,
    hasOrganization: Boolean(candidate.organization),
    evidenceCount: 1 + fit.evidenceMatches.length,
    sourceKind: candidate.sourceKind,
  }) + fit.confidenceBonus - (fit.blockedKeywords.length ? 8 : 0));
  const pursuit = pursuitScore({
    matchScore,
    confidenceScore: confidence,
    deadline: candidate.deadline,
    priority: fit.priority,
  });
  const dedupeKey = candidate.url || candidate.id || `${candidate.title}:${candidate.sourceName}`;
  const scoreBreakdown = {
    ...(candidate.scoreBreakdown as unknown as Record<string, unknown>),
    total: matchScore,
    originalTotal: candidate.matchScore,
    laneFit: laneFitMetadata(fit),
  };
  const reasons = [...new Set([...fit.reasons, ...candidate.reasons])].slice(0, 8);
  const signals = [...new Set([...candidate.signals, ...fit.signals])].slice(0, 12);
  const existing = await db.discoveryCandidate.findFirst({
    where: { ownerId, dedupeKey, status: { notIn: ["SAVED", "DISMISSED"] } },
    include: { evidence: true, lane: true },
  });

  const data = {
    laneId: lane.id,
    missionId,
    title: candidate.title,
    description: candidate.description,
    rawContent: candidate.rawContent,
    url: candidate.url || undefined,
    organization: candidate.organization,
    workspace: candidate.country === "DK" ? "DK" as const : candidate.country ? "GLOBAL" as const : undefined,
    sourceName: candidate.sourceName,
    sourceKind: candidate.sourceKind,
    provider: candidate.provider,
    query: candidate.query,
    category: candidate.category,
    budgetMin: candidate.budgetMin,
    budgetMax: candidate.budgetMax,
    currency: candidate.currency ?? "DKK",
    deadline: dateOrUndefined(candidate.deadline),
    applicationRoute: candidate.applicationRoute,
    matchScore,
    confidenceScore: confidence,
    pursuitScore: pursuit,
    scoreBreakdown: scoreBreakdown as Prisma.InputJsonValue,
    reasons,
    signals,
    dedupeKey,
  };

  const saved = existing
    ? await db.discoveryCandidate.update({ where: { id: existing.id }, data, include: { evidence: true, lane: true } })
    : await db.discoveryCandidate.create({ data: { ownerId, ...data }, include: { evidence: true, lane: true } });

  if (saved.evidence.length === 0) {
    await db.evidence.create({
      data: {
        ownerId,
        candidateId: saved.id,
        kind: candidate.url ? "WEB_RESULT" : "SOURCE_SNIPPET",
        url: candidate.url || undefined,
        title: candidate.title,
        snippet: (candidate.rawContent || candidate.description || candidate.title).slice(0, 2000),
        sourceName: candidate.sourceName,
        provider: candidate.provider,
        confidence,
        metadata: {
          sourceKind: candidate.sourceKind,
          query: candidate.query,
          laneSlug: lane.slug,
          laneName: lane.name,
          signals,
          reasons,
          laneFit: laneFitMetadata(fit),
        },
      },
    });
  }
  return saved;
}

export async function saveCandidateAsDeal(ownerId: string, candidateId: string) {
  const candidate = await db.discoveryCandidate.findFirst({
    where: { id: candidateId, ownerId },
    include: { lane: true, evidence: true, deal: true },
  });
  if (!candidate) throw new Error("Candidate not found");
  if (candidate.deal) return { deal: candidate.deal, created: false };

  const account = await ensureAccount(ownerId, {
    name: candidate.organization || candidate.sourceName || host(candidate.url) || candidate.title,
    website: candidate.url,
    workspace: candidate.workspace as Workspace,
    type: accountTypeFrom({
      organization: candidate.organization,
      category: candidate.category,
      sourceKind: candidate.sourceKind,
      laneSlug: candidate.lane?.slug,
    }),
    source: candidate.sourceName,
    fitScore: candidate.pursuitScore ?? candidate.matchScore,
  });

  const deal = await db.deal.create({
    data: {
      ownerId,
      accountId: account.id,
      laneId: candidate.laneId,
      title: candidate.title,
      summary: candidate.description,
      rawContent: candidate.rawContent,
      valueMin: candidate.budgetMin,
      valueMax: candidate.budgetMax,
      currency: candidate.currency ?? "DKK",
      deadline: candidate.deadline,
      status: "QUALIFYING",
      workspace: candidate.workspace,
      category: candidate.category,
      applicationRoute: candidate.applicationRoute,
      url: candidate.url,
      matchScore: candidate.matchScore,
      confidenceScore: candidate.confidenceScore,
      pursuitScore: candidate.pursuitScore,
      qualification: {
        candidateId: candidate.id,
        reasons: candidate.reasons,
        signals: candidate.signals,
        lane: candidate.lane?.slug,
      },
      nextAction: "Qualify buyer, budget and decision process.",
    },
  });

  await db.discoveryCandidate.update({
    where: { id: candidate.id },
    data: { status: "SAVED", accountId: account.id, dealId: deal.id },
  });

  for (const evidence of candidate.evidence) {
    await db.evidence.create({
      data: {
        ownerId,
        accountId: account.id,
        dealId: deal.id,
        kind: evidence.kind,
        url: evidence.url,
        title: evidence.title,
        snippet: evidence.snippet,
        sourceName: evidence.sourceName,
        provider: evidence.provider,
        confidence: evidence.confidence,
        metadata: evidence.metadata as Prisma.InputJsonValue,
      },
    });
  }

  await db.task.create({
    data: {
      ownerId,
      accountId: account.id,
      dealId: deal.id,
      title: "Qualify buyer, budget and next step",
      description: candidate.lane?.conversionGuidance,
      dueAt: candidate.deadline ? new Date(Math.min(candidate.deadline.getTime(), Date.now() + 3 * 86400000)) : undefined,
      priority: (candidate.pursuitScore ?? 0) >= 80 ? "HIGH" : "MEDIUM",
    },
  });

  return { deal, account, created: true };
}
