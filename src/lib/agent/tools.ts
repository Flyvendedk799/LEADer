import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { DEAL_INCLUDE, createDiscoveryMission, ensureAccount, getCockpit, saveCandidateAsDeal } from "@/lib/crm";
import { ensureDefaultDiscoveryLanes, filterVisibleLaneCandidates } from "@/lib/crm/lanes";
import { pursuitScore } from "@/lib/crm/scoring";
import { discoveryLogEntry, discoveryQueueLogMessage } from "@/lib/crm/discovery-logging";
import { discoveryMissionInputMatchesActiveRun } from "@/lib/crm/discovery-run-actions";
import { discoveryQueueSnapshot, enqueueDiscoveryMission, visibleDiscoveryQueueSnapshotForOwner } from "@/lib/crm/discovery-queue";
import { workflowLogEntry, workflowQueueLogMessage } from "@/lib/workflows/logging";
import { createWorkflowRun } from "@/lib/workflows/playbooks";
import { ACTIVE_WORKFLOW_RUN_STATUSES } from "@/lib/workflows/preset-runs";
import { enqueueWorkflowRun, visibleWorkflowQueueSnapshotForOwner, workflowQueueSnapshot } from "@/lib/workflows/queue";
import { findActiveResearchBriefRun, researchBriefIdentityFromInput } from "@/lib/workflows/research-targets";
import { workflowRunInputSchema } from "@/lib/workflows/types";
import { researchBriefRunPayload } from "@/lib/workflows/usecase-actions";
import { discoveryMissionHref } from "@/lib/discovery-links";
import type { ConversionAssetKind, DealStatus, TaskPriority, TaskStatus, TouchpointKind, Workspace } from "@/lib/types";

const limitSchema = z.number().int().min(1).max(25).default(8);
const workspaceSchema = z.enum(["DK", "GLOBAL"]).default("DK");
const dealStatusSchema = z.enum([
  "DISCOVERED",
  "QUALIFYING",
  "INTERESTING",
  "CONTACTED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ARCHIVED",
]);
const taskStatusSchema = z.enum(["OPEN", "DONE", "DISMISSED"]);
const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const touchpointKindSchema = z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "COMMUNITY", "MESSAGE", "OTHER"]);
const conversionAssetKindSchema = z.enum(["OUTREACH", "PROPOSAL", "FOLLOW_UP", "CHECKLIST", "CALL_PREP", "PITCH", "SUMMARY"]);

export type AgentToolRisk = "read" | "write";

export interface AgentToolResult {
  tool: string;
  title: string;
  summary: string;
  data?: unknown;
  mutated?: boolean;
}

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputHint: string;
  risk: AgentToolRisk;
  schema: T;
  execute: (ownerId: string, args: z.infer<T>) => Promise<AgentToolResult>;
}

function clean(value?: string | null, fallback = "") {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function parseDate(value?: string | Date | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function compactDeal(deal: {
  id: string;
  title: string;
  status: string;
  pursuitScore?: number | null;
  nextAction?: string | null;
  deadline?: Date | string | null;
  account?: { name: string } | null;
}) {
  return {
    id: deal.id,
    title: deal.title,
    status: deal.status,
    account: deal.account?.name,
    pursuitScore: deal.pursuitScore,
    deadline: deal.deadline,
    nextAction: deal.nextAction,
  };
}

function makeSearchWhere(ownerId: string, query?: string) {
  const q = clean(query);
  return {
    ownerId,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { summary: { contains: q, mode: "insensitive" as const } },
            { rawContent: { contains: q, mode: "insensitive" as const } },
            { account: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

const searchCrmSchema = z.object({
  entity: z.enum(["all", "deals", "accounts", "people", "tasks", "candidates"]).default("all"),
  query: z.string().max(240).optional(),
  status: z.string().max(80).optional(),
  limit: limitSchema,
});

const getCockpitSchema = z.object({ workspace: workspaceSchema });

const getDealSchema = z.object({
  dealId: z.string().optional(),
  query: z.string().max(240).optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(180),
  description: z.string().max(1000).optional(),
  dueAt: z.string().optional(),
  priority: taskPrioritySchema.default("MEDIUM"),
  dealId: z.string().optional(),
  accountId: z.string().optional(),
  personId: z.string().optional(),
});

const updateTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(180).optional(),
  description: z.string().max(1000).optional(),
  dueAt: z.string().nullable().optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
});

const listTasksSchema = z.object({
  status: taskStatusSchema.optional(),
  dealId: z.string().optional(),
  accountId: z.string().optional(),
  limit: limitSchema,
});

const logTouchpointSchema = z.object({
  kind: touchpointKindSchema.default("NOTE"),
  summary: z.string().min(1).max(240),
  body: z.string().max(2000).optional(),
  outcome: z.string().max(500).optional(),
  dealId: z.string().optional(),
  accountId: z.string().optional(),
  personId: z.string().optional(),
});

const updateDealSchema = z.object({
  dealId: z.string().min(1),
  status: dealStatusSchema.optional(),
  nextAction: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  statusReason: z.string().max(1000).optional(),
  wonLostReason: z.string().max(1000).optional(),
});

const createAccountSchema = z.object({
  name: z.string().min(1).max(180),
  website: z.string().url().optional().or(z.literal("")),
  description: z.string().max(2000).optional(),
  type: z.enum(["COMPANY", "STARTUP", "PUBLIC_BUYER", "COMMUNITY", "PARTNER", "PERSONA", "UNKNOWN"]).default("UNKNOWN"),
  workspace: workspaceSchema,
  source: z.string().max(180).optional(),
  tags: z.array(z.string().max(50)).max(12).default([]),
});

const createPersonSchema = z.object({
  accountId: z.string().optional(),
  name: z.string().max(160).optional(),
  role: z.string().max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(80).optional(),
  linkedin: z.string().max(240).optional(),
  notes: z.string().max(1000).optional(),
});

const createDealSchema = z.object({
  accountId: z.string().optional(),
  title: z.string().min(3).max(240),
  summary: z.string().max(2000).optional(),
  valueMin: z.number().int().nonnegative().optional(),
  valueMax: z.number().int().nonnegative().optional(),
  currency: z.string().max(12).default("DKK"),
  deadline: z.string().optional(),
  status: dealStatusSchema.default("DISCOVERED"),
  priority: z.number().int().min(0).max(3).default(0),
  workspace: workspaceSchema,
  category: z.string().max(120).optional(),
  url: z.string().url().optional().or(z.literal("")),
  nextAction: z.string().max(1000).optional(),
});

const createConversionAssetSchema = z.object({
  kind: conversionAssetKindSchema.default("SUMMARY"),
  title: z.string().max(180).optional(),
  content: z.string().min(1).max(12000),
  dealId: z.string().optional(),
  accountId: z.string().optional(),
  candidateId: z.string().optional(),
});

const listDiscoveryLanesSchema = z.object({ activeOnly: z.boolean().default(true) });

const runDiscoveryLaneSchema = z.object({
  laneId: z.string().optional(),
  laneSlug: z.string().optional(),
  query: z.string().max(500).optional(),
  freeformBrief: z.string().max(1200).optional(),
  workspace: workspaceSchema,
  searchMode: z.enum(["focused", "balanced", "wide"]).default("balanced"),
  useAiPlanner: z.boolean().default(true),
  requiredTerms: z.array(z.string().max(80)).max(12).default([]),
  excludedTerms: z.array(z.string().max(80)).max(12).default([]),
  maxResults: z.number().int().min(4).max(30).default(8),
  includeWeb: z.boolean().default(true),
  includeSources: z.boolean().default(true),
  provider: z.enum(["auto", "tavily", "brave", "serper", "none"]).default("auto"),
});

const saveCandidateSchema = z.object({ candidateId: z.string().min(1) });

const queueResearchBriefSchema = z.object({
  subject: z.string().trim().min(2).max(160),
  subjectType: z.enum(["person", "company", "unknown"]).default("unknown"),
  objective: z.enum(["find-contact", "qualify-lead", "map-opportunity", "verify-identity", "general"]).default("find-contact"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  workspace: workspaceSchema,
  createTasks: z.boolean().default(true),
  accountId: z.string().optional(),
  personId: z.string().optional(),
  dealId: z.string().optional(),
  candidateId: z.string().optional(),
});

export const AGENT_TOOLS = [
  {
    name: "search_crm",
    description: "Search across CRM objects. Use this before answering questions about existing deals, accounts, people, tasks, or candidates.",
    inputHint: `{ "entity": "all|deals|accounts|people|tasks|candidates", "query": "optional text", "status": "optional status", "limit": 8 }`,
    risk: "read",
    schema: searchCrmSchema,
    async execute(ownerId, args) {
      const limit = args.limit;
      const q = clean(args.query);
      const includeAll = args.entity === "all";
      const candidateFetchLimit = Math.max(limit * 3, limit);
      const [deals, accounts, people, tasks, candidateRows] = await Promise.all([
        includeAll || args.entity === "deals"
          ? db.deal.findMany({
              where: { ...makeSearchWhere(ownerId, q), ...(args.status ? { status: args.status as DealStatus } : {}) },
              include: { account: true },
              orderBy: [{ pursuitScore: "desc" }, { updatedAt: "desc" }],
              take: limit,
            })
          : Promise.resolve([]),
        includeAll || args.entity === "accounts"
          ? db.account.findMany({
              where: {
                ownerId,
                ...(q
                  ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }
                  : {}),
              },
              include: { _count: { select: { deals: true, people: true, tasks: true } } },
              orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
              take: limit,
            })
          : Promise.resolve([]),
        includeAll || args.entity === "people"
          ? db.person.findMany({
              where: {
                ownerId,
                ...(q
                  ? {
                      OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { role: { contains: q, mode: "insensitive" } },
                        { email: { contains: q, mode: "insensitive" } },
                      ],
                    }
                  : {}),
              },
              include: { account: true },
              orderBy: { updatedAt: "desc" },
              take: limit,
            })
          : Promise.resolve([]),
        includeAll || args.entity === "tasks"
          ? db.task.findMany({
              where: {
                ownerId,
                ...(args.status ? { status: args.status as TaskStatus } : {}),
                ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
              },
              include: { deal: { include: { account: true } }, account: true, person: true },
              orderBy: [{ status: "asc" }, { dueAt: "asc" }],
              take: limit,
            })
          : Promise.resolve([]),
        includeAll || args.entity === "candidates"
          ? db.discoveryCandidate.findMany({
              where: {
                ownerId,
                ...(args.status ? { status: args.status as never } : {}),
                ...(q
                  ? {
                      OR: [
                        { title: { contains: q, mode: "insensitive" } },
                        { description: { contains: q, mode: "insensitive" } },
                        { organization: { contains: q, mode: "insensitive" } },
                      ],
                    }
                  : {}),
              },
              include: { lane: true, evidence: { take: 1, orderBy: { createdAt: "desc" } } },
              orderBy: [{ pursuitScore: "desc" }, { updatedAt: "desc" }],
              take: candidateFetchLimit,
            })
          : Promise.resolve([]),
      ]);
      const candidates = filterVisibleLaneCandidates(candidateRows).slice(0, limit);

      return {
        tool: "search_crm",
        title: "CRM search",
        summary: `Found ${deals.length} deals, ${accounts.length} accounts, ${people.length} people, ${tasks.length} tasks and ${candidates.length} candidates.`,
        data: {
          deals: deals.map(compactDeal),
          accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, fitScore: a.fitScore, counts: a._count })),
          people: people.map((p) => ({ id: p.id, name: p.name, role: p.role, email: p.email, account: p.account?.name })),
          tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt, priority: t.priority, deal: t.deal?.title, account: t.account?.name })),
          candidates: candidates.map((c) => ({ id: c.id, title: c.title, status: c.status, lane: c.lane?.name, pursuitScore: c.pursuitScore, evidence: c.evidence[0]?.snippet })),
        },
      };
    },
  },
  {
    name: "get_cockpit",
    description: "Read the daily cockpit: open deals, hot candidates, overdue tasks, upcoming deadlines, stale deals and pipeline stats.",
    inputHint: `{ "workspace": "DK|GLOBAL" }`,
    risk: "read",
    schema: getCockpitSchema,
    async execute(ownerId, args) {
      const cockpit = await getCockpit(ownerId, args.workspace as Workspace);
      return {
        tool: "get_cockpit",
        title: "Client cockpit",
        summary: `${cockpit.openDeals} open deals, ${cockpit.hotCandidates.length} hot candidates, ${cockpit.overdueTasks.length} overdue tasks.`,
        data: cockpit,
      };
    },
  },
  {
    name: "get_deal",
    description: "Read one deal with account, people, evidence, tasks, conversion assets and touchpoints.",
    inputHint: `{ "dealId": "deal id" } or { "query": "deal title text" }`,
    risk: "read",
    schema: getDealSchema,
    async execute(ownerId, args) {
      const deal = args.dealId
        ? await db.deal.findFirst({ where: { id: args.dealId, ownerId }, include: DEAL_INCLUDE })
        : await db.deal.findFirst({
            where: makeSearchWhere(ownerId, args.query),
            include: DEAL_INCLUDE,
            orderBy: [{ pursuitScore: "desc" }, { updatedAt: "desc" }],
          });
      if (!deal) throw new Error("Deal not found");
      return {
        tool: "get_deal",
        title: deal.title,
        summary: `${deal.status} deal${deal.account ? ` for ${deal.account.name}` : ""}. Next action: ${deal.nextAction || "not set"}.`,
        data: deal,
      };
    },
  },
  {
    name: "list_tasks",
    description: "List tasks and follow-ups.",
    inputHint: `{ "status": "OPEN|DONE|DISMISSED", "dealId": "optional", "accountId": "optional", "limit": 8 }`,
    risk: "read",
    schema: listTasksSchema,
    async execute(ownerId, args) {
      const tasks = await db.task.findMany({
        where: {
          ownerId,
          ...(args.status ? { status: args.status as TaskStatus } : {}),
          ...(args.dealId ? { dealId: args.dealId } : {}),
          ...(args.accountId ? { accountId: args.accountId } : {}),
        },
        include: { deal: { include: { account: true } }, account: true, person: true },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: args.limit,
      });
      return {
        tool: "list_tasks",
        title: "Tasks",
        summary: `Found ${tasks.length} tasks.`,
        data: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt, priority: t.priority, deal: t.deal?.title, account: t.account?.name })),
      };
    },
  },
  {
    name: "create_task",
    description: "Create a task or follow-up. Can optionally link it to a deal, account or person.",
    inputHint: `{ "title": "...", "description": "...", "dueAt": "ISO date", "priority": "LOW|MEDIUM|HIGH|URGENT", "dealId": "optional" }`,
    risk: "write",
    schema: createTaskSchema,
    async execute(ownerId, args) {
      const task = await db.task.create({
        data: {
          ownerId,
          title: args.title,
          description: args.description,
          dueAt: parseDate(args.dueAt),
          priority: args.priority as TaskPriority,
          dealId: args.dealId,
          accountId: args.accountId,
          personId: args.personId,
        },
      });
      return {
        tool: "create_task",
        title: "Task created",
        summary: `Created task: ${task.title}.`,
        data: task,
        mutated: true,
      };
    },
  },
  {
    name: "update_task",
    description: "Update task fields or mark a task done/dismissed/open.",
    inputHint: `{ "id": "task id", "status": "DONE", "title": "optional", "dueAt": "ISO date or null" }`,
    risk: "write",
    schema: updateTaskSchema,
    async execute(ownerId, args) {
      const { id, dueAt, ...data } = args;
      const updated = await db.task.updateMany({
        where: { id, ownerId },
        data: {
          ...data,
          dueAt: dueAt === null ? null : parseDate(dueAt),
          completedAt: data.status === "DONE" ? new Date() : undefined,
        },
      });
      if (updated.count === 0) throw new Error("Task not found");
      const task = await db.task.findFirst({ where: { id, ownerId } });
      return {
        tool: "update_task",
        title: "Task updated",
        summary: `Updated task: ${task?.title ?? id}.`,
        data: task,
        mutated: true,
      };
    },
  },
  {
    name: "log_touchpoint",
    description: "Log a note, call, email, meeting, message or community interaction.",
    inputHint: `{ "kind": "NOTE|CALL|EMAIL|MEETING|MESSAGE|COMMUNITY|OTHER", "summary": "...", "dealId": "optional", "accountId": "optional" }`,
    risk: "write",
    schema: logTouchpointSchema,
    async execute(ownerId, args) {
      const touchpoint = await db.touchpoint.create({
        data: {
          ownerId,
          kind: args.kind as TouchpointKind,
          summary: args.summary,
          body: args.body,
          outcome: args.outcome,
          dealId: args.dealId,
          accountId: args.accountId,
          personId: args.personId,
          metadata: { createdBy: "platform-agent" } as Prisma.InputJsonValue,
        },
      });
      return {
        tool: "log_touchpoint",
        title: "Touchpoint logged",
        summary: `Logged ${touchpoint.kind.toLowerCase()}: ${touchpoint.summary}.`,
        data: touchpoint,
        mutated: true,
      };
    },
  },
  {
    name: "update_deal",
    description: "Update a deal status, next action, priority, status reason or won/lost reason.",
    inputHint: `{ "dealId": "...", "status": "CONTACTED", "nextAction": "...", "priority": 2 }`,
    risk: "write",
    schema: updateDealSchema,
    async execute(ownerId, args) {
      const existing = await db.deal.findFirst({ where: { id: args.dealId, ownerId } });
      if (!existing) throw new Error("Deal not found");
      const deal = await db.deal.update({
        where: { id: existing.id },
        data: {
          status: args.status as DealStatus | undefined,
          nextAction: args.nextAction,
          priority: args.priority,
          statusReason: args.statusReason,
          wonLostReason: args.wonLostReason,
          pursuitScore: pursuitScore({
            matchScore: existing.matchScore,
            confidenceScore: existing.confidenceScore,
            deadline: existing.deadline,
            priority: args.priority ?? existing.priority,
          }),
        },
        include: { account: true },
      });
      return {
        tool: "update_deal",
        title: "Deal updated",
        summary: `Updated ${deal.title} (${deal.status}).`,
        data: compactDeal(deal),
        mutated: true,
      };
    },
  },
  {
    name: "create_account",
    description: "Create or update an account/company/customer record.",
    inputHint: `{ "name": "...", "type": "COMPANY|STARTUP|PUBLIC_BUYER|...", "website": "https://...", "workspace": "DK|GLOBAL" }`,
    risk: "write",
    schema: createAccountSchema,
    async execute(ownerId, args) {
      const account = await ensureAccount(ownerId, {
        name: args.name,
        website: args.website || undefined,
        workspace: args.workspace as Workspace,
        type: args.type,
        source: args.source,
      });
      if (args.description || args.tags.length) {
        await db.account.update({
          where: { id: account.id },
          data: { description: args.description, tags: args.tags },
        });
      }
      const saved = await db.account.findFirst({ where: { id: account.id, ownerId } });
      return {
        tool: "create_account",
        title: "Account saved",
        summary: `Saved account: ${saved?.name ?? args.name}.`,
        data: saved,
        mutated: true,
      };
    },
  },
  {
    name: "create_person",
    description: "Create or update a person/contact, optionally linked to an account.",
    inputHint: `{ "accountId": "optional", "name": "...", "role": "...", "email": "..." }`,
    risk: "write",
    schema: createPersonSchema,
    async execute(ownerId, args) {
      const data = { ...args, email: args.email || undefined };
      const person = data.email
        ? await db.person.upsert({
            where: { ownerId_email: { ownerId, email: data.email } },
            update: data,
            create: { ownerId, ...data },
          })
        : await db.person.create({ data: { ownerId, ...data } });
      return {
        tool: "create_person",
        title: "Person saved",
        summary: `Saved contact: ${person.name || person.email || person.id}.`,
        data: person,
        mutated: true,
      };
    },
  },
  {
    name: "create_deal",
    description: "Create a deal/pipeline item, optionally linked to an account.",
    inputHint: `{ "accountId": "optional", "title": "...", "summary": "...", "status": "DISCOVERED", "workspace": "DK" }`,
    risk: "write",
    schema: createDealSchema,
    async execute(ownerId, args) {
      const deal = await db.deal.create({
        data: {
          ownerId,
          accountId: args.accountId,
          title: args.title,
          summary: args.summary,
          valueMin: args.valueMin,
          valueMax: args.valueMax,
          currency: args.currency,
          deadline: parseDate(args.deadline),
          status: args.status as DealStatus,
          priority: args.priority,
          workspace: args.workspace as Workspace,
          category: args.category,
          url: args.url || undefined,
          nextAction: args.nextAction,
          pursuitScore: pursuitScore({ deadline: args.deadline, priority: args.priority }),
        },
        include: { account: true },
      });
      return {
        tool: "create_deal",
        title: "Deal created",
        summary: `Created deal: ${deal.title}.`,
        data: compactDeal(deal),
        mutated: true,
      };
    },
  },
  {
    name: "create_conversion_asset",
    description: "Save a generated outreach, proposal, follow-up, checklist, pitch, call prep or summary asset.",
    inputHint: `{ "kind": "OUTREACH|PROPOSAL|FOLLOW_UP|CHECKLIST|CALL_PREP|PITCH|SUMMARY", "content": "...", "dealId": "optional" }`,
    risk: "write",
    schema: createConversionAssetSchema,
    async execute(ownerId, args) {
      const asset = await db.conversionAsset.create({
        data: {
          ownerId,
          kind: args.kind as ConversionAssetKind,
          title: args.title,
          content: args.content,
          dealId: args.dealId,
          accountId: args.accountId,
          candidateId: args.candidateId,
          model: "platform-agent",
        },
      });
      return {
        tool: "create_conversion_asset",
        title: "Conversion asset saved",
        summary: `Saved ${asset.kind.toLowerCase()} asset${asset.title ? `: ${asset.title}` : ""}.`,
        data: asset,
        mutated: true,
      };
    },
  },
  {
    name: "list_discovery_lanes",
    description: "List discovery lanes and their search playbooks.",
    inputHint: `{ "activeOnly": true }`,
    risk: "read",
    schema: listDiscoveryLanesSchema,
    async execute(ownerId, args) {
      await ensureDefaultDiscoveryLanes(ownerId);
      const lanes = await db.discoveryLane.findMany({
        where: { ownerId, ...(args.activeOnly ? { active: true } : {}) },
        orderBy: [{ active: "desc" }, { createdAt: "asc" }],
        include: { _count: { select: { candidates: true, missions: true, deals: true } } },
      });
      return {
        tool: "list_discovery_lanes",
        title: "Discovery lanes",
        summary: `Found ${lanes.length} lanes.`,
        data: lanes.map((lane) => ({
          id: lane.id,
          slug: lane.slug,
          name: lane.name,
          description: lane.description,
          positiveKeywords: lane.positiveKeywords,
          evidenceRequirements: lane.evidenceRequirements,
          counts: lane._count,
        })),
      };
    },
  },
  {
    name: "run_discovery_lane",
    description: "Queue a background discovery lane search. Uses only configured public web providers and saved automatable sources; community/network lanes remain manual/user-assisted.",
    inputHint: `{ "laneSlug": "sme-ai-automation", "freeformBrief": "...", "workspace": "DK|GLOBAL", "searchMode": "focused|balanced|wide", "maxResults": 8 }`,
    risk: "write",
    schema: runDiscoveryLaneSchema,
    async execute(ownerId, args) {
      await ensureDefaultDiscoveryLanes(ownerId);
      const lane = args.laneId
        ? await db.discoveryLane.findFirst({ where: { id: args.laneId, ownerId } })
        : await db.discoveryLane.findFirst({
            where: {
              ownerId,
              OR: [
                { slug: args.laneSlug || "" },
                { name: { contains: args.laneSlug || "", mode: "insensitive" } },
              ],
            },
          });
      if (!lane) throw new Error("Discovery lane not found");
      const input = {
        laneId: lane.id,
        query: args.query,
        freeformBrief: args.freeformBrief,
        workspace: args.workspace as Workspace,
        searchMode: args.searchMode,
        useAiPlanner: args.useAiPlanner,
        requiredTerms: args.requiredTerms,
        excludedTerms: args.excludedTerms,
        maxResults: args.maxResults,
        includeWeb: args.includeWeb,
        includeSources: args.includeSources,
        provider: args.provider,
      };
      const activeMissions = await db.discoveryMission.findMany({
        where: { ownerId, status: { in: ["QUEUED", "RUNNING"] }, finishedAt: null },
        select: { id: true, status: true, finishedAt: true, workspace: true, input: true },
        orderBy: [{ queuePriority: "desc" }, { startedAt: "asc" }],
        take: 50,
      });
      const existing = activeMissions.find((mission) => discoveryMissionInputMatchesActiveRun(input, mission));
      if (existing) {
        return {
          tool: "run_discovery_lane",
          title: "Discovery mission already active",
          summary: `${lane.name} discovery is already queued or running.`,
          data: {
            missionId: existing.id,
            status: existing.status,
            href: discoveryMissionHref(existing.id),
            lane: lane.name,
            queue: await visibleDiscoveryQueueSnapshotForOwner(ownerId),
          },
          mutated: false,
        };
      }

      const mission = await createDiscoveryMission(ownerId, input, "QUEUED");
      enqueueDiscoveryMission(ownerId, mission.id, input);
      const queue = discoveryQueueSnapshot(ownerId);
      await db.discoveryMission.update({
        where: { id: mission.id },
        data: { log: { push: discoveryLogEntry(discoveryQueueLogMessage(mission.id, queue)) } },
      }).catch(() => {});

      return {
        tool: "run_discovery_lane",
        title: "Discovery mission queued",
        summary: `Queued ${lane.name}; it will keep running in the background.`,
        data: {
          missionId: mission.id,
          status: "QUEUED",
          href: discoveryMissionHref(mission.id),
          lane: lane.name,
          queue,
        },
        mutated: true,
      };
    },
  },
  {
    name: "queue_research_brief",
    description: "Queue a durable OSINT-style research brief for a person, company, domain, phone, email or clue. Use for finding contact routes, phone/email, verifying identity, or mapping opportunity context.",
    inputHint: `{ "subject": "Mette Jensen", "objective": "find-contact", "depth": "standard", "workspace": "DK" }`,
    risk: "write",
    schema: queueResearchBriefSchema,
    async execute(ownerId, args) {
      const input = workflowRunInputSchema.parse(
        researchBriefRunPayload({
          subject: args.subject,
          subjectType: args.subjectType,
          objective: args.objective,
          depth: args.depth,
          createTasks: args.createTasks,
          workspace: args.workspace,
          accountId: args.accountId,
          personId: args.personId,
          dealId: args.dealId,
          candidateId: args.candidateId,
        }),
      );
      const activeRuns = await db.workflowRun.findMany({
        where: {
          ownerId,
          playbook: "research-brief",
          status: { in: [...ACTIVE_WORKFLOW_RUN_STATUSES] },
          finishedAt: null,
        },
        orderBy: [{ queuePriority: "desc" }, { createdAt: "asc" }],
        take: 50,
      });
      const existing = findActiveResearchBriefRun(activeRuns, researchBriefIdentityFromInput(input));
      if (existing) {
        return {
          tool: "queue_research_brief",
          title: "Research brief already active",
          summary: `Research brief already active for ${args.subject}.`,
          data: {
            runId: existing.id,
            status: existing.status,
            href: `/workflows/runs/${existing.id}`,
            queue: await visibleWorkflowQueueSnapshotForOwner(ownerId),
          },
          mutated: false,
        };
      }

      const run = await createWorkflowRun(ownerId, input, "QUEUED");
      enqueueWorkflowRun(ownerId, run.id, input);
      const queue = workflowQueueSnapshot(ownerId);
      const queueLog = workflowLogEntry(workflowQueueLogMessage(run.id, queue));
      await db.workflowRun.update({
        where: { id: run.id },
        data: { log: { push: queueLog } },
      }).catch(() => {});

      return {
        tool: "queue_research_brief",
        title: "Research brief queued",
        summary: `Queued ${args.depth} ${args.objective.replace("-", " ")} research brief for ${args.subject}.`,
        data: {
          runId: run.id,
          status: "QUEUED",
          href: `/workflows/runs/${run.id}`,
          queue,
        },
        mutated: true,
      };
    },
  },
  {
    name: "save_candidate_as_deal",
    description: "Promote a discovery candidate into an account/deal and create the first qualification task.",
    inputHint: `{ "candidateId": "..." }`,
    risk: "write",
    schema: saveCandidateSchema,
    async execute(ownerId, args) {
      const result = await saveCandidateAsDeal(ownerId, args.candidateId);
      return {
        tool: "save_candidate_as_deal",
        title: result.created ? "Candidate saved as deal" : "Candidate already had a deal",
        summary: `${result.deal.title} is in the pipeline.`,
        data: result,
        mutated: true,
      };
    },
  },
] satisfies AgentToolDefinition[];

export const AGENT_TOOL_CATALOG = AGENT_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputHint: tool.inputHint,
  risk: tool.risk,
}));

export type AgentToolName = (typeof AGENT_TOOLS)[number]["name"];

export async function executeAgentTool(ownerId: string, call: AgentToolCall): Promise<AgentToolResult> {
  const tool = AGENT_TOOLS.find((item) => item.name === call.tool);
  if (!tool) throw new Error(`Unknown tool: ${call.tool}`);
  const args = tool.schema.parse(call.args ?? {});
  return tool.execute(ownerId, args);
}
