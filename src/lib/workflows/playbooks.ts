import type { Prisma } from "@prisma/client";

import { dispatchForOwner, type DispatchResult } from "@/lib/alerts/dispatch";
import { saveCandidateAsDeal } from "@/lib/crm";
import { filterVisibleLaneCandidates } from "@/lib/crm/lanes";
import { db } from "@/lib/db";
import { runDueDiscovery, type RunResult } from "@/lib/ingestion";
import type { Workspace } from "@/lib/types";
import { formatWorkflowElapsed, workflowLogEntry } from "./logging";
import {
  buildResearchChecklist,
  buildResearchDecisionFrame,
  buildResearchRunbook,
  buildResearchWorksheet,
  normalizeResearchBriefOptions,
  researchSubjectClueSummary,
  type NormalizedResearchBriefOptions,
  type ResearchChecklistItem,
  type ResearchDecisionFrame,
  type ResearchSubjectClueSummary,
  type ResearchRunbookStep,
  type ResearchWorksheetSection,
} from "./research-brief";
import { summarizeSourceRuns, type SourceRunSummary } from "./summary";
import type { WorkflowRunInput, WorkflowRunOptions } from "./types";

export type WorkflowPlaybook = "daily-sweep" | "pipeline-rescue" | "candidate-harvest" | "operating-day" | "research-brief";

const OPEN_DEAL_STATUSES = ["DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const;
const DAY = 24 * 60 * 60 * 1000;

export type DailySweepResult = {
  playbook: "daily-sweep";
  workspace: Workspace;
  ranAt: string;
  durationMs: number;
  sources: SourceRunSummary & { results: RunResult[] };
  reminders: DispatchResult;
  digest: DispatchResult;
  log: string[];
};

export type PipelineRescueResult = {
  playbook: "pipeline-rescue";
  workspace: Workspace;
  ranAt: string;
  durationMs: number;
  staleDeals: {
    reviewed: number;
    tasksCreated: number;
  };
  deadlines: {
    reviewed: number;
    tasksCreated: number;
  };
  nextActionsUpdated: number;
  skippedExistingTasks: number;
  taskIds: string[];
  log: string[];
};

export type CandidateHarvestResult = {
  playbook: "candidate-harvest";
  workspace: Workspace;
  ranAt: string;
  durationMs: number;
  candidates: {
    reviewed: number;
    saved: number;
    alreadyInPipeline: number;
    minScore: number;
  };
  candidateIds: string[];
  dealIds: string[];
  taskIds: string[];
  log: string[];
};

export type OperatingDayResult = {
  playbook: "operating-day";
  workspace: Workspace;
  ranAt: string;
  durationMs: number;
  phases: {
    dailySweep: boolean;
    candidateHarvest: boolean;
    pipelineRescue: boolean;
  };
  dailySweep?: DailySweepResult;
  candidateHarvest?: CandidateHarvestResult;
  pipelineRescue?: PipelineRescueResult;
  dealIds: string[];
  taskIds: string[];
  log: string[];
};

export type ResearchBriefResult = {
  playbook: "research-brief";
  workspace: Workspace;
  ranAt: string;
  durationMs: number;
  subject: string;
  subjectType: NormalizedResearchBriefOptions["subjectType"];
  objective: NormalizedResearchBriefOptions["objective"];
  depth: NormalizedResearchBriefOptions["depth"];
  createdTasks: number;
  skippedExistingTasks: number;
  taskIds: string[];
  existingTaskIds: string[];
  clueSummary: ResearchSubjectClueSummary[];
  decisionFrame: ResearchDecisionFrame;
  checklist: ResearchChecklistItem[];
  worksheet: ResearchWorksheetSection[];
  runbook: ResearchRunbookStep[];
  linked: {
    accountId?: string;
    accountName?: string;
    personId?: string;
    personName?: string;
    dealId?: string;
    dealTitle?: string;
    candidateId?: string;
    candidateMissionId?: string;
    candidateTitle?: string;
    candidateUrl?: string;
    candidateEvidence?: string;
  };
  log: string[];
};

export type WorkflowPlaybookResult =
  | DailySweepResult
  | PipelineRescueResult
  | CandidateHarvestResult
  | OperatingDayResult
  | ResearchBriefResult;
type WorkflowLogSink = (entry: string) => void | Promise<void>;
export type WorkflowRunTrigger = "manual" | "preset" | "schedule" | "rerun";
export type WorkflowExecutionContext = {
  onLog?: WorkflowLogSink;
  isCanceled?: () => Promise<boolean>;
};

export class WorkflowRunCanceledError extends Error {
  constructor() {
    super("Workflow run was canceled.");
    this.name = "WorkflowRunCanceledError";
  }
}

type WorkflowRunMetadata = {
  trigger?: WorkflowRunTrigger;
  presetId?: string | null;
  presetName?: string | null;
};

async function throwIfWorkflowCanceled(context?: WorkflowExecutionContext) {
  if (await context?.isCanceled?.()) {
    throw new WorkflowRunCanceledError();
  }
}

function atNine(date: Date) {
  date.setHours(9, 0, 0, 0);
  return date;
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return atNine(date);
}

function prepDueDate(deadline: Date | null) {
  const fallback = tomorrow();
  if (!deadline) return fallback;
  const beforeDeadline = new Date(deadline);
  beforeDeadline.setDate(beforeDeadline.getDate() - 1);
  atNine(beforeDeadline);
  return beforeDeadline.getTime() > Date.now() ? beforeDeadline : fallback;
}

export function workflowRunSummary(result: WorkflowPlaybookResult) {
  if (result.playbook === "operating-day") {
    const rescueTasks =
      (result.pipelineRescue?.staleDeals.tasksCreated ?? 0) + (result.pipelineRescue?.deadlines.tasksCreated ?? 0);
    return `${result.dailySweep?.sources.created ?? 0} new from sources, ${result.candidateHarvest?.candidates.saved ?? 0} candidates saved, ${rescueTasks} rescue tasks created.`;
  }
  if (result.playbook === "candidate-harvest") {
    return `${result.candidates.saved} hot candidates saved as deals, ${result.candidates.alreadyInPipeline} already in pipeline.`;
  }
  if (result.playbook === "pipeline-rescue") {
    return `${result.staleDeals.tasksCreated} stale follow-up tasks, ${result.deadlines.tasksCreated} deadline prep tasks, ${result.nextActionsUpdated} next actions updated.`;
  }
  if (result.playbook === "research-brief") {
    return `${result.createdTasks} research tasks created, ${result.skippedExistingTasks} already existed for ${result.subject}.`;
  }
  const failed = result.sources.failed ? `, ${result.sources.failed} failed` : "";
  return `${result.sources.ran} sources, ${result.sources.created} new, ${result.sources.updated} updated${failed}; ${result.reminders.created} reminders; ${result.digest.created} digest.`;
}

export function workflowRunStartMessage(input: WorkflowRunInput, status: string, metadata: WorkflowRunMetadata) {
  const verb = status === "RUNNING" ? "Started" : "Queued";
  const origin =
    metadata.trigger === "schedule"
      ? ` from scheduled preset${metadata.presetName ? ` "${metadata.presetName}"` : ""}`
      : metadata.trigger === "preset"
        ? ` from preset${metadata.presetName ? ` "${metadata.presetName}"` : ""}`
        : metadata.trigger === "rerun"
          ? " as rerun"
          : "";
  return `${verb} ${input.playbook} playbook for ${input.workspace}${origin}.`;
}

export async function createWorkflowRun(
  ownerId: string,
  input: WorkflowRunInput,
  status = "QUEUED",
  metadata: WorkflowRunMetadata = {},
) {
  return db.workflowRun.create({
    data: {
      ownerId,
      presetId: metadata.presetId ?? null,
      trigger: metadata.trigger ?? "manual",
      playbook: input.playbook,
      workspace: input.workspace,
      status,
      input: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
      log: [workflowLogEntry(workflowRunStartMessage(input, status, metadata))],
      startedAt: status === "RUNNING" ? new Date() : null,
    },
  });
}

export async function executeWorkflowRun(ownerId: string, runId: string, input: WorkflowRunInput) {
  const workerStartedAt = Date.now();
  const persistedPlaybookLogs = new Set<string>();
  const isCanceled = async () => {
    const current = await db.workflowRun.findFirst({
      where: { id: runId, ownerId },
      select: { status: true },
    });
    return current?.status === "CANCELED";
  };
  async function recordPlaybookLog(entry: string) {
    persistedPlaybookLogs.add(entry);
    await db.workflowRun.updateMany({
      where: { id: runId, ownerId, status: { not: "CANCELED" } },
      data: { log: { push: entry } },
    });
  }

  try {
    const started = await db.workflowRun.updateMany({
      where: { id: runId, ownerId, status: { not: "CANCELED" } },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        finishedAt: null,
        log: { push: workflowLogEntry("Worker started playbook.") },
      },
    });
    if (started.count === 0) {
      return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
    }

    const result = await runWorkflowPlaybook(ownerId, input, {
      onLog: recordPlaybookLog,
      isCanceled,
    });
    const current = await db.workflowRun.findFirst({ where: { id: runId, ownerId }, select: { status: true } });
    if (current?.status === "CANCELED") {
      return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
    }

    for (const entry of result.log) {
      if (persistedPlaybookLogs.has(entry)) continue;
      await db.workflowRun.update({ where: { id: runId }, data: { log: { push: entry } } });
    }

    const finished = await db.workflowRun.updateMany({
      where: { id: runId, ownerId, status: { not: "CANCELED" } },
      data: {
        status: "SUCCESS",
        result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        finishedAt: new Date(),
        log: {
          push: workflowLogEntry(
            `Playbook complete after ${formatWorkflowElapsed(Date.now() - workerStartedAt)}: ${workflowRunSummary(result)}`,
          ),
        },
      },
    });
    if (finished.count === 0) {
      return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
    }
    return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
  } catch (error) {
    if (error instanceof WorkflowRunCanceledError) {
      await db.workflowRun.updateMany({
        where: { id: runId, ownerId, status: "CANCELED" },
        data: {
          log: {
            push: workflowLogEntry(
              `Playbook stopped after cancellation before the next side effect after ${formatWorkflowElapsed(Date.now() - workerStartedAt)}.`,
            ),
          },
        },
      }).catch(() => {});
      return db.workflowRun.findFirst({ where: { id: runId, ownerId } });
    }

    await db.workflowRun.updateMany({
      where: { id: runId, ownerId, status: { not: "CANCELED" } },
      data: {
        status: "ERROR",
        result: {
          error: error instanceof Error ? error.message : "Workflow playbook failed",
        },
        finishedAt: new Date(),
        log: {
          push: workflowLogEntry(
            `Playbook failed after ${formatWorkflowElapsed(Date.now() - workerStartedAt)}: ${error instanceof Error ? error.message : "Workflow playbook failed"}`,
          ),
        },
      },
    }).catch(() => {});
    throw error;
  }
}

type DailySweepOptions = NonNullable<WorkflowRunOptions>["dailySweep"];
type CandidateHarvestOptions = NonNullable<WorkflowRunOptions>["candidateHarvest"];
type PipelineRescueOptions = NonNullable<WorkflowRunOptions>["pipelineRescue"];
type OperatingDayOptions = NonNullable<WorkflowRunOptions>["operatingDay"];
type ResearchBriefOptions = NonNullable<WorkflowRunOptions>["researchBrief"];

const emptyDispatchResult: DispatchResult = { created: 0, emailed: 0, provider: "none" };

export async function runDailySweep(
  ownerId: string,
  workspace: Workspace = "DK",
  options: DailySweepOptions = {},
  context: WorkflowExecutionContext = {},
): Promise<DailySweepResult> {
  const startedAt = Date.now();
  const log = [workflowLogEntry(`Started daily sweep for ${workspace}.`)];

  const includeSources = options?.includeSources !== false;
  const includeAlerts = options?.includeAlerts !== false;

  await throwIfWorkflowCanceled(context);
  const sourceResults = includeSources ? await runDueDiscovery(ownerId) : [];
  await throwIfWorkflowCanceled(context);
  const sourceSummary = summarizeSourceRuns(sourceResults);
  if (includeSources) {
    log.push(
      workflowLogEntry(
        `Checked due sources: ${sourceSummary.ran} ran, ${sourceSummary.created} new, ${sourceSummary.updated} updated, ${sourceSummary.failed} failed.`,
      ),
    );
  } else {
    log.push(workflowLogEntry("Skipped due sources by run options."));
  }

  const alerts = includeAlerts
    ? await dispatchForOwner(ownerId, { digest: true, workspace })
    : { reminders: emptyDispatchResult, digest: emptyDispatchResult };
  await throwIfWorkflowCanceled(context);
  if (includeAlerts) {
    log.push(
      workflowLogEntry(
        `Generated alerts: ${alerts.reminders.created} reminders and ${alerts.digest?.created ?? 0} digest.`,
      ),
    );
  } else {
    log.push(workflowLogEntry("Skipped reminders and digest by run options."));
  }

  const durationMs = Date.now() - startedAt;
  log.push(workflowLogEntry(`Finished daily sweep in ${formatWorkflowElapsed(durationMs)}.`));

  return {
    playbook: "daily-sweep",
    workspace,
    ranAt: new Date().toISOString(),
    durationMs,
    sources: { ...sourceSummary, results: sourceResults },
    reminders: alerts.reminders,
    digest: alerts.digest ?? { created: 0, emailed: 0, provider: "none" },
    log,
  };
}

export async function runPipelineRescue(
  ownerId: string,
  workspace: Workspace = "DK",
  options: PipelineRescueOptions = {},
  context: WorkflowExecutionContext = {},
): Promise<PipelineRescueResult> {
  const startedAt = Date.now();
  const now = new Date();
  const staleDays = options?.staleDays ?? 14;
  const deadlineDays = options?.deadlineDays ?? 7;
  const limit = options?.limit ?? 12;
  const staleCutoff = new Date(now.getTime() - staleDays * DAY);
  const deadlineHorizon = new Date(now.getTime() + deadlineDays * DAY);
  const log = [workflowLogEntry(`Started pipeline rescue for ${workspace}.`)];

  const [staleDeals, deadlineDeals] = await Promise.all([
    db.deal.findMany({
      where: {
        ownerId,
        workspace,
        status: { in: [...OPEN_DEAL_STATUSES] },
        updatedAt: { lt: staleCutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: { id: true, title: true, accountId: true, nextAction: true },
    }),
    db.deal.findMany({
      where: {
        ownerId,
        workspace,
        status: { in: [...OPEN_DEAL_STATUSES] },
        deadline: { gte: now, lte: deadlineHorizon },
      },
      orderBy: { deadline: "asc" },
      take: limit,
      select: { id: true, title: true, accountId: true, deadline: true, nextAction: true },
    }),
  ]);
  await throwIfWorkflowCanceled(context);

  const targetDealIds = [...new Set([...staleDeals.map((deal) => deal.id), ...deadlineDeals.map((deal) => deal.id)])];
  const existingTasks = targetDealIds.length
    ? await db.task.findMany({
        where: { ownerId, dealId: { in: targetDealIds }, status: "OPEN" },
        select: { dealId: true, title: true },
      })
    : [];
  const existingTaskKeys = new Set(existingTasks.map((task) => `${task.dealId}:${task.title}`));

  let staleTasksCreated = 0;
  let deadlineTasksCreated = 0;
  let skippedExistingTasks = 0;
  let nextActionsUpdated = 0;
  const taskIds: string[] = [];

  async function ensureTask({
    dealId,
    accountId,
    title,
    description,
    dueAt,
    priority,
    nextAction,
    kind,
  }: {
    dealId: string;
    accountId: string | null;
    title: string;
    description: string;
    dueAt: Date;
    priority: "HIGH" | "URGENT";
    nextAction: string;
    kind: "stale" | "deadline";
  }) {
    await throwIfWorkflowCanceled(context);
    const taskKey = `${dealId}:${title}`;
    if (existingTaskKeys.has(taskKey)) {
      skippedExistingTasks++;
    } else {
      const task = await db.task.create({
        data: {
          ownerId,
          dealId,
          accountId,
          title,
          description,
          dueAt,
          priority,
        },
        select: { id: true },
      });
      taskIds.push(task.id);
      existingTaskKeys.add(taskKey);
      if (kind === "stale") staleTasksCreated++;
      if (kind === "deadline") deadlineTasksCreated++;
    }

    await throwIfWorkflowCanceled(context);
    const updated = await db.deal.updateMany({
      where: { id: dealId, ownerId, OR: [{ nextAction: null }, { nextAction: { not: nextAction } }] },
      data: { nextAction },
    });
    nextActionsUpdated += updated.count;
  }

  for (const deal of staleDeals) {
    await throwIfWorkflowCanceled(context);
    await ensureTask({
      dealId: deal.id,
      accountId: deal.accountId,
      title: `Follow up: ${deal.title}`,
      description: "Pipeline rescue created this because the deal has been stale for at least 14 days.",
      dueAt: tomorrow(),
      priority: "HIGH",
      nextAction: "Follow up and confirm buyer, budget, decision process, and next step.",
      kind: "stale",
    });
  }

  for (const deal of deadlineDeals) {
    await throwIfWorkflowCanceled(context);
    await ensureTask({
      dealId: deal.id,
      accountId: deal.accountId,
      title: `Prepare submission: ${deal.title}`,
      description: "Pipeline rescue created this because the deadline is within 7 days.",
      dueAt: prepDueDate(deal.deadline),
      priority: "URGENT",
      nextAction: "Prepare submission package and confirm route before the deadline.",
      kind: "deadline",
    });
  }

  log.push(
    workflowLogEntry(
      `Reviewed ${staleDeals.length} stale deals and ${deadlineDeals.length} deadline deals; created ${staleTasksCreated + deadlineTasksCreated} tasks.`,
    ),
  );
  log.push(workflowLogEntry(`Pipeline rescue options: stale ${staleDays}d, deadlines ${deadlineDays}d, limit ${limit}.`));
  if (skippedExistingTasks) {
    log.push(workflowLogEntry(`Skipped ${skippedExistingTasks} tasks that already existed.`));
  }
  log.push(workflowLogEntry(`Updated ${nextActionsUpdated} deal next actions.`));

  const durationMs = Date.now() - startedAt;
  log.push(workflowLogEntry(`Finished pipeline rescue in ${formatWorkflowElapsed(durationMs)}.`));

  return {
    playbook: "pipeline-rescue",
    workspace,
    ranAt: new Date().toISOString(),
    durationMs,
    staleDeals: {
      reviewed: staleDeals.length,
      tasksCreated: staleTasksCreated,
    },
    deadlines: {
      reviewed: deadlineDeals.length,
      tasksCreated: deadlineTasksCreated,
    },
    nextActionsUpdated,
    skippedExistingTasks,
    taskIds,
    log,
  };
}

export async function runCandidateHarvest(
  ownerId: string,
  workspace: Workspace = "DK",
  options: CandidateHarvestOptions = {},
  context: WorkflowExecutionContext = {},
): Promise<CandidateHarvestResult> {
  const startedAt = Date.now();
  const minScore = options?.minScore ?? 70;
  const limit = options?.limit ?? 5;
  const log = [workflowLogEntry(`Started candidate harvest for ${workspace}.`)];
  const rawCandidates = await db.discoveryCandidate.findMany({
    where: {
      ownerId,
      workspace,
      status: "NEW",
      pursuitScore: { gte: minScore },
    },
    orderBy: [{ pursuitScore: "desc" }, { createdAt: "desc" }],
    take: Math.max(limit * 3, limit),
    include: { lane: true },
  });
  const candidates = filterVisibleLaneCandidates(rawCandidates).slice(0, limit);
  await throwIfWorkflowCanceled(context);

  const candidateIds: string[] = [];
  const dealIds: string[] = [];
  const taskIds: string[] = [];
  let saved = 0;
  let alreadyInPipeline = 0;

  for (const candidate of candidates) {
    await throwIfWorkflowCanceled(context);
    const result = await saveCandidateAsDeal(ownerId, candidate.id);
    candidateIds.push(candidate.id);
    dealIds.push(result.deal.id);
    if (result.created) {
      saved++;
      log.push(workflowLogEntry(`Saved candidate "${candidate.title}" as a deal.`));
    } else {
      alreadyInPipeline++;
      log.push(workflowLogEntry(`Candidate "${candidate.title}" was already in the pipeline.`));
    }

    await throwIfWorkflowCanceled(context);
    const task = await db.task.findFirst({
      where: {
        ownerId,
        dealId: result.deal.id,
        title: "Qualify buyer, budget and next step",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (task) taskIds.push(task.id);
  }

  log.push(workflowLogEntry(`Reviewed ${candidates.length} hot candidates; saved ${saved} new deals.`));
  log.push(workflowLogEntry(`Candidate harvest options: min score ${minScore}, limit ${limit}.`));

  const durationMs = Date.now() - startedAt;
  log.push(workflowLogEntry(`Finished candidate harvest in ${formatWorkflowElapsed(durationMs)}.`));

  return {
    playbook: "candidate-harvest",
    workspace,
    ranAt: new Date().toISOString(),
    durationMs,
    candidates: {
      reviewed: candidates.length,
      saved,
      alreadyInPipeline,
      minScore,
    },
    candidateIds,
    dealIds: [...new Set(dealIds)],
    taskIds: [...new Set(taskIds)],
    log,
  };
}

function researchTaskDueDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

function researchTaskWhere(
  ownerId: string,
  titles: string[],
  linked: { accountId?: string; personId?: string; dealId?: string },
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    ownerId,
    status: "OPEN",
    title: { in: titles },
  };
  if (linked.dealId) return { ...where, dealId: linked.dealId };
  if (linked.accountId) return { ...where, accountId: linked.accountId };
  if (linked.personId) return { ...where, personId: linked.personId };
  return where;
}

function candidateContextBlock(candidate: {
  title?: string | null;
  organization?: string | null;
  sourceName?: string | null;
  url?: string | null;
  rawContent?: string | null;
  description?: string | null;
  evidence?: { title?: string | null; snippet?: string | null; url?: string | null }[];
} | null) {
  if (!candidate) return "";
  const evidence = candidate.evidence?.[0];
  const lines = [
    `Discovery candidate: ${candidate.title ?? "Untitled candidate"}`,
    candidate.organization ? `Organization: ${candidate.organization}` : "",
    candidate.sourceName ? `Source: ${candidate.sourceName}` : "",
    candidate.url ? `Candidate URL: ${candidate.url}` : "",
    evidence?.title ? `Evidence title: ${evidence.title}` : "",
    evidence?.url ? `Evidence URL: ${evidence.url}` : "",
    evidence?.snippet
      ? `Evidence snippet: ${evidence.snippet}`
      : candidate.rawContent || candidate.description
        ? `Candidate context: ${(candidate.rawContent || candidate.description || "").slice(0, 1000)}`
        : "",
  ].filter(Boolean);
  return lines.length ? `\n\nLinked discovery context:\n${lines.join("\n")}` : "";
}

function linkedCrmContextBlock(linked: {
  accountName?: string;
  personName?: string;
  dealTitle?: string;
}) {
  const lines = [
    linked.accountName ? `Account: ${linked.accountName}` : "",
    linked.personName ? `Person: ${linked.personName}` : "",
    linked.dealTitle ? `Deal: ${linked.dealTitle}` : "",
  ].filter(Boolean);
  return lines.length ? `\n\nLinked CRM context:\n${lines.join("\n")}` : "";
}

export async function runResearchBrief(
  ownerId: string,
  workspace: Workspace = "DK",
  options: ResearchBriefOptions = undefined,
  context: WorkflowExecutionContext = {},
): Promise<ResearchBriefResult> {
  const startedAt = Date.now();
  const normalized = normalizeResearchBriefOptions(options);
  if (!normalized.subject) {
    throw new Error("Research brief requires a subject.");
  }

  const log = [workflowLogEntry(`Started research brief for ${workspace}: ${normalized.subject}.`)];

  const [account, person, deal, candidate] = await Promise.all([
    normalized.accountId
      ? db.account.findFirst({
          where: { id: normalized.accountId, ownerId },
          select: { id: true, name: true },
        })
      : null,
    normalized.personId
      ? db.person.findFirst({
          where: { id: normalized.personId, ownerId },
          select: { id: true, name: true, accountId: true },
        })
      : null,
    normalized.dealId
      ? db.deal.findFirst({
          where: { id: normalized.dealId, ownerId },
          select: { id: true, title: true, accountId: true },
        })
      : null,
    normalized.candidateId
      ? db.discoveryCandidate.findFirst({
          where: { id: normalized.candidateId, ownerId },
          select: {
            id: true,
            missionId: true,
            title: true,
            organization: true,
            sourceName: true,
            url: true,
            rawContent: true,
            description: true,
            accountId: true,
            dealId: true,
            evidence: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { title: true, snippet: true, url: true },
            },
          },
        })
      : null,
  ]);

  if (normalized.accountId && !account) log.push(workflowLogEntry("Skipped account link because it was not found for this owner."));
  if (normalized.personId && !person) log.push(workflowLogEntry("Skipped person link because it was not found for this owner."));
  if (normalized.dealId && !deal) log.push(workflowLogEntry("Skipped deal link because it was not found for this owner."));
  if (normalized.candidateId && !candidate) log.push(workflowLogEntry("Skipped candidate link because it was not found for this owner."));

  const linkedDeal = deal ?? (
    candidate?.dealId
      ? await db.deal.findFirst({
          where: { id: candidate.dealId, ownerId },
          select: { id: true, title: true, accountId: true },
        })
      : null
  );
  const linkedAccountId = account?.id ?? linkedDeal?.accountId ?? person?.accountId ?? candidate?.accountId;
  const linkedAccount = account ?? (
    linkedAccountId
      ? await db.account.findFirst({
          where: { id: linkedAccountId, ownerId },
          select: { id: true, name: true },
        })
      : null
  );

  const candidateContext = candidateContextBlock(candidate);
  const candidateEvidence = candidate?.evidence[0]?.snippet ?? candidate?.rawContent ?? candidate?.description ?? undefined;
  const linked = {
    accountId: linkedAccount?.id ?? linkedDeal?.accountId ?? person?.accountId ?? candidate?.accountId ?? undefined,
    accountName: linkedAccount?.name,
    personId: person?.id,
    personName: person?.name ?? undefined,
    dealId: linkedDeal?.id ?? candidate?.dealId ?? undefined,
    dealTitle: linkedDeal?.title,
    candidateId: candidate?.id,
    candidateMissionId: candidate?.missionId ?? undefined,
    candidateTitle: candidate?.title,
    candidateUrl: candidate?.url ?? undefined,
    candidateEvidence: candidateEvidence?.slice(0, 1200),
  };
  const linkedCrmContext = linkedCrmContextBlock(linked);
  const taskContext = `${linkedCrmContext}${candidateContext}`;

  const checklist = buildResearchChecklist(normalized, workspace);
  const worksheet = buildResearchWorksheet(normalized, workspace);
  const runbook = buildResearchRunbook(normalized, workspace);
  const clueSummary = researchSubjectClueSummary(normalized.subject);
  const decisionFrame = buildResearchDecisionFrame(normalized, workspace);
  const taskIds: string[] = [];
  const existingTaskIds: string[] = [];
  let createdTasks = 0;
  let skippedExistingTasks = 0;

  if (normalized.createTasks) {
    await throwIfWorkflowCanceled(context);
    const existingTasks = await db.task.findMany({
      where: researchTaskWhere(ownerId, checklist.map((step) => step.title), linked),
      select: { id: true, title: true },
    });
    const existingTitles = new Set(existingTasks.map((task) => task.title));
    const existingIdsByTitle = new Map(existingTasks.map((task) => [task.title, task.id]));

    for (const step of checklist) {
      await throwIfWorkflowCanceled(context);
      if (existingTitles.has(step.title)) {
        const existingTaskId = existingIdsByTitle.get(step.title);
        if (existingTaskId) existingTaskIds.push(existingTaskId);
        skippedExistingTasks++;
        continue;
      }
      const task = await db.task.create({
        data: {
          ownerId,
          accountId: linked.accountId,
          personId: linked.personId,
          dealId: linked.dealId,
          title: step.title,
          description: `${step.description}${taskContext}`,
          dueAt: researchTaskDueDate(step.dueInDays),
          priority: step.priority,
        },
        select: { id: true },
      });
      taskIds.push(task.id);
      existingTitles.add(step.title);
      existingIdsByTitle.set(step.title, task.id);
      createdTasks++;
    }
    log.push(workflowLogEntry(`Created ${createdTasks} research tasks; skipped ${skippedExistingTasks} existing tasks.`));
  } else {
    log.push(workflowLogEntry("Generated checklist without creating tasks by run options."));
  }

  log.push(
    workflowLogEntry(
      `Research brief options: ${normalized.subjectType}, ${normalized.objective}, ${normalized.depth}, ${checklist.length} checklist steps.`,
    ),
  );
  log.push(workflowLogEntry(`Prepared ${worksheet.length} worksheet sections for evidence capture.`));
  log.push(workflowLogEntry(`Prepared ${runbook.length} runbook steps for practical lookup order.`));
  log.push(workflowLogEntry(`Prepared operator decision frame with ${decisionFrame.fields.length} fields.`));
  if (candidate) {
    log.push(workflowLogEntry(`Linked discovery candidate "${candidate.title}".`));
  }

  const durationMs = Date.now() - startedAt;
  log.push(workflowLogEntry(`Finished research brief in ${formatWorkflowElapsed(durationMs)}.`));

  return {
    playbook: "research-brief",
    workspace,
    ranAt: new Date().toISOString(),
    durationMs,
    subject: normalized.subject,
    subjectType: normalized.subjectType,
    objective: normalized.objective,
    depth: normalized.depth,
    createdTasks,
    skippedExistingTasks,
    taskIds,
    existingTaskIds,
    clueSummary,
    decisionFrame,
    checklist,
    worksheet,
    runbook,
    linked,
    log,
  };
}

export async function runOperatingDay(
  ownerId: string,
  workspace: Workspace = "DK",
  options: WorkflowRunOptions = {},
  context: WorkflowExecutionContext = {},
): Promise<OperatingDayResult> {
  const startedAt = Date.now();
  const log: string[] = [];
  const phases = {
    dailySweep: options?.operatingDay?.dailySweep !== false,
    candidateHarvest: options?.operatingDay?.candidateHarvest !== false,
    pipelineRescue: options?.operatingDay?.pipelineRescue !== false,
  };

  async function record(entry: string) {
    log.push(entry);
    await context.onLog?.(entry);
  }

  await record(workflowLogEntry(`Started operating day for ${workspace}.`));

  let dailySweep: DailySweepResult | undefined;
  if (phases.dailySweep) {
    await throwIfWorkflowCanceled(context);
    dailySweep = await runDailySweep(ownerId, workspace, options?.dailySweep, context);
    for (const entry of dailySweep.log) {
      await record(`[daily-sweep] ${entry}`);
    }
    await record(workflowLogEntry(`Daily sweep complete: ${workflowRunSummary(dailySweep)}`));
  } else {
    await record(workflowLogEntry("Skipped daily sweep by run options."));
  }

  let candidateHarvest: CandidateHarvestResult | undefined;
  if (phases.candidateHarvest) {
    await throwIfWorkflowCanceled(context);
    candidateHarvest = await runCandidateHarvest(ownerId, workspace, options?.candidateHarvest, context);
    for (const entry of candidateHarvest.log) {
      await record(`[candidate-harvest] ${entry}`);
    }
    await record(workflowLogEntry(`Candidate harvest complete: ${workflowRunSummary(candidateHarvest)}`));
  } else {
    await record(workflowLogEntry("Skipped candidate harvest by run options."));
  }

  let pipelineRescue: PipelineRescueResult | undefined;
  if (phases.pipelineRescue) {
    await throwIfWorkflowCanceled(context);
    pipelineRescue = await runPipelineRescue(ownerId, workspace, options?.pipelineRescue, context);
    for (const entry of pipelineRescue.log) {
      await record(`[pipeline-rescue] ${entry}`);
    }
    await record(workflowLogEntry(`Pipeline rescue complete: ${workflowRunSummary(pipelineRescue)}`));
  } else {
    await record(workflowLogEntry("Skipped pipeline rescue by run options."));
  }

  const durationMs = Date.now() - startedAt;
  await record(workflowLogEntry(`Finished operating day in ${formatWorkflowElapsed(durationMs)}.`));

  return {
    playbook: "operating-day",
    workspace,
    ranAt: new Date().toISOString(),
    durationMs,
    phases,
    dailySweep,
    candidateHarvest,
    pipelineRescue,
    dealIds: [...new Set(candidateHarvest?.dealIds ?? [])],
    taskIds: [...new Set([...(candidateHarvest?.taskIds ?? []), ...(pipelineRescue?.taskIds ?? [])])],
    log,
  };
}

export async function runWorkflowPlaybook(
  ownerId: string,
  input: WorkflowRunInput,
  context: WorkflowExecutionContext = {},
): Promise<WorkflowPlaybookResult> {
  switch (input.playbook) {
    case "research-brief":
      return runResearchBrief(ownerId, input.workspace, input.options?.researchBrief, context);
    case "operating-day":
      return runOperatingDay(ownerId, input.workspace, input.options, context);
    case "candidate-harvest":
      return runCandidateHarvest(ownerId, input.workspace, input.options?.candidateHarvest, context);
    case "pipeline-rescue":
      return runPipelineRescue(ownerId, input.workspace, input.options?.pipelineRescue, context);
    case "daily-sweep":
    default:
      return runDailySweep(ownerId, input.workspace, input.options?.dailySweep, context);
  }
}
