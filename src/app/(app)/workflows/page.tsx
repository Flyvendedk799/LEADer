import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Compass,
  Database,
  PlayCircle,
  Radar,
  Search,
  Sparkles,
  Target,
  TimerReset,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowActionQueue } from "@/components/workflows/workflow-action-queue";
import { WorkflowActivityFeed } from "@/components/workflows/workflow-activity-feed";
import { WorkflowAlertQueue } from "@/components/workflows/workflow-alert-queue";
import { WorkflowCandidateQueue } from "@/components/workflows/workflow-candidate-queue";
import { WorkflowDealQueue } from "@/components/workflows/workflow-deal-queue";
import { WorkflowDiscoveryMissionQueue, type WorkflowDiscoveryMissionItem } from "@/components/workflows/workflow-discovery-mission-queue";
import { WorkflowPresetPanel, type WorkflowPresetPanelItem } from "@/components/workflows/workflow-preset-panel";
import { WorkflowRunQueue } from "@/components/workflows/workflow-run-queue";
import { WorkflowSavedSearchQueue } from "@/components/workflows/workflow-saved-search-queue";
import { WorkflowSourceQueue } from "@/components/workflows/workflow-source-queue";
import { WorkflowRecommendationPanel, type WorkflowRecommendationItem } from "@/components/workflows/workflow-recommendation-panel";
import { WorkflowResearchTargetQueue, type WorkflowResearchTargetItem } from "@/components/workflows/workflow-research-target-queue";
import { WorkflowUsecaseLauncher } from "@/components/workflows/workflow-usecase-launcher";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  discoveryMissionDisplayWarnings,
  discoveryMissionProviderLabel,
  filterReviewableDiscoveryCandidates,
  hiddenDiscoveryCandidatesWarning,
} from "@/lib/crm/discovery-display";
import {
  ensureDefaultDiscoveryLanes,
  filterVisibleLaneCandidates,
  type CandidateLike,
  type LaneLike,
} from "@/lib/crm/lanes";
import { recoverDiscoveryQueue } from "@/lib/crm/discovery-queue";
import { dismissInvalidNewLaneCandidates } from "@/lib/crm/lane-hygiene";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { discoveryMissionHref } from "@/lib/discovery-links";
import { isSourceDue } from "@/lib/ingestion";
import { describeSavedSearchFilters, savedSearchDiscoveryPayload, savedSearchFiltersToHref } from "@/lib/saved-searches";
import { cn, formatBudget } from "@/lib/utils";
import { ensureDefaultWorkflowPresets, presetToWorkflowInput, workflowPresetOptionSummary, workflowPresetScheduleSummary } from "@/lib/workflows/presets";
import { ACTIVE_WORKFLOW_RUN_STATUSES } from "@/lib/workflows/preset-runs";
import { previewWorkflowRun } from "@/lib/workflows/preview";
import { recoverWorkflowQueue } from "@/lib/workflows/queue";
import { filterWorkflowRecommendations } from "@/lib/workflows/recommendation-actions";
import {
  candidateContactResearchSubject,
  contactResearchReason,
  countReachablePeople,
  findActiveResearchBriefRun,
  needsContactResearch,
  needsPersonContactResearch,
  personContactResearchReason,
  personResearchSubject,
} from "@/lib/workflows/research-targets";
import { workflowRunResultSummary } from "@/lib/workflows/result-summary";

export const dynamic = "force-dynamic";

const OPEN_DEAL_STATUSES = ["DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const;
const AUTOMATABLE_SOURCE_TYPES = new Set(["RSS", "NEWSLETTER", "PUBLIC_WEB", "PROCUREMENT", "ACCELERATOR", "API"]);
const missionCandidateGateSelect = {
  title: true,
  description: true,
  rawContent: true,
  url: true,
  organization: true,
  sourceName: true,
  sourceKind: true,
  category: true,
  budgetMin: true,
  budgetMax: true,
  deadline: true,
  status: true,
  applicationRoute: true,
} satisfies Partial<Record<keyof CandidateLike, true>>;

function firstQuery(value = "") {
  return value.split("\n").map((item) => item.trim()).filter(Boolean)[0] || "Discovery mission";
}

function visibleMissionCandidateMeta(mission: {
  lane: LaneLike | null;
  candidates: CandidateLike[];
  provider?: string | null;
  log?: string[];
  warnings: string[];
  _count: { candidates: number };
}) {
  const visible = filterReviewableDiscoveryCandidates(mission.lane, mission.candidates);
  const baseWarnings = discoveryMissionDisplayWarnings(mission, mission.warnings);
  const hiddenWarning = hiddenDiscoveryCandidatesWarning(visible.removed, visible.reasons);
  return {
    candidateCount: visible.candidates.length,
    warnings: hiddenWarning ? [...baseWarnings, hiddenWarning] : baseWarnings,
  };
}

function alertPayload(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;
  return {
    opportunityId: typeof payload.opportunityId === "string" ? payload.opportunityId : undefined,
    workspace: typeof payload.workspace === "string" ? payload.workspace : undefined,
  };
}

function alertHref(raw: unknown) {
  const payload = alertPayload(raw);
  return payload?.opportunityId ? `/opportunities/${payload.opportunityId}` : "/workflows";
}

export default async function WorkflowsPage() {
  const ownerId = await requireOwnerId();
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const staleCutoff = new Date(now.getTime() - 14 * 86400000);
  await ensureDefaultDiscoveryLanes(ownerId);
  await ensureDefaultWorkflowPresets(ownerId);
  await dismissInvalidNewLaneCandidates(ownerId).catch(() => null);
  const discoveryQueue = await recoverDiscoveryQueue(ownerId);
  const workflowQueue = await recoverWorkflowQueue(ownerId);

  const [
    lanes,
    missions,
    workflowRuns,
    workflowPresets,
    activePresetRuns,
    workflowPresetEvents,
    hotCandidatesRaw,
    contactGapAccounts,
    activeResearchBriefRuns,
    overdueTasks,
    dueTasks,
    staleDeals,
    upcomingDeadlines,
    activeSources,
    sourceSchedules,
    savedSearches,
    unreadAlerts,
    recentAlerts,
    recentSourceRuns,
    recentAssets,
    recentOpportunityActivities,
    statusGroups,
    pipelineValue,
  ] = await Promise.all([
    db.discoveryLane.findMany({
      where: { ownerId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, description: true },
    }),
    db.discoveryMission.findMany({
      where: { ownerId },
      include: {
        lane: true,
        candidates: { select: missionCandidateGateSelect },
        _count: { select: { candidates: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    db.workflowRun.findMany({
      where: { ownerId },
      include: { preset: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.workflowPreset.findMany({
      where: { ownerId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    db.workflowRun.findMany({
      where: {
        ownerId,
        presetId: { not: null },
        status: { in: [...ACTIVE_WORKFLOW_RUN_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, presetId: true, status: true, trigger: true, createdAt: true },
    }),
    db.workflowPresetEvent.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        presetId: true,
        runId: true,
        eventType: true,
        reason: true,
        message: true,
        createdAt: true,
      },
    }),
    db.discoveryCandidate.findMany({
      where: { ownerId, status: "NEW", pursuitScore: { gte: 70 } },
      include: { lane: true, evidence: { take: 1, orderBy: { createdAt: "desc" } } },
      orderBy: [{ pursuitScore: "desc" }, { createdAt: "desc" }],
      take: 24,
    }),
    db.account.findMany({
      where: {
        ownerId,
        deals: { some: { status: { in: [...OPEN_DEAL_STATUSES] } } },
      },
      include: {
        people: {
          select: {
            id: true,
            name: true,
            role: true,
            email: true,
            phone: true,
            linkedin: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        },
        deals: {
          where: { status: { in: [...OPEN_DEAL_STATUSES] } },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, title: true, updatedAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    db.workflowRun.findMany({
      where: {
        ownerId,
        playbook: "research-brief",
        status: { in: [...ACTIVE_WORKFLOW_RUN_STATUSES] },
        finishedAt: null,
      },
      orderBy: [{ queuePriority: "desc" }, { createdAt: "asc" }],
      select: { id: true, status: true, input: true },
      take: 50,
    }),
    db.task.findMany({
      where: { ownerId, status: "OPEN", dueAt: { lt: now } },
      include: { deal: { include: { account: true } }, account: true },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
      take: 8,
    }),
    db.task.findMany({
      where: { ownerId, status: "OPEN", dueAt: { gte: now, lte: weekFromNow } },
      include: { deal: { include: { account: true } }, account: true },
      orderBy: [{ dueAt: "asc" }, { priority: "desc" }],
      take: 8,
    }),
    db.deal.findMany({
      where: { ownerId, status: { in: [...OPEN_DEAL_STATUSES] }, updatedAt: { lt: staleCutoff } },
      include: { account: true, lane: true },
      orderBy: { updatedAt: "asc" },
      take: 8,
    }),
    db.deal.findMany({
      where: { ownerId, status: { in: [...OPEN_DEAL_STATUSES] }, deadline: { gte: now } },
      include: { account: true, lane: true },
      orderBy: { deadline: "asc" },
      take: 8,
    }),
    db.source.findMany({
      where: { ownerId, enabled: true },
      orderBy: [{ lastCheckedAt: "asc" }, { createdAt: "desc" }],
      take: 10,
    }),
    db.source.findMany({
      where: { ownerId, enabled: true },
      select: { id: true, type: true, frequency: true, lastCheckedAt: true },
    }),
    db.savedSearch.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.alert.findMany({
      where: { ownerId, read: false },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.alert.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.discoveryRun.findMany({
      where: { source: { is: { ownerId } } },
      include: { source: { select: { name: true } } },
      orderBy: { startedAt: "desc" },
      take: 6,
    }),
    db.conversionAsset.findMany({
      where: { ownerId },
      include: {
        deal: { select: { id: true, title: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.activity.findMany({
      where: { opportunity: { ownerId } },
      include: { opportunity: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.deal.groupBy({
      by: ["status"],
      where: { ownerId },
      _count: { _all: true },
    }),
    db.deal.aggregate({
      where: { ownerId, status: { in: [...OPEN_DEAL_STATUSES] } },
      _sum: { valueMax: true, valueMin: true },
    }),
  ]);

  const runningMissions = missions.filter((mission) => mission.status === "QUEUED" || mission.status === "RUNNING");
  const runningWorkflowRuns = workflowRuns.filter((run) => run.status === "QUEUED" || run.status === "RUNNING");
  const openTaskCount = overdueTasks.length + dueTasks.length;
  const openPipelineValue = pipelineValue._sum.valueMax ?? pipelineValue._sum.valueMin ?? 0;
  const dueSourceCount = sourceSchedules.filter(
    (source) => AUTOMATABLE_SOURCE_TYPES.has(source.type) && isSourceDue(source, now),
  ).length;
  const hotCandidates = filterVisibleLaneCandidates(hotCandidatesRaw).slice(0, 8);
  const contactResearchTargets: WorkflowResearchTargetItem[] = contactGapAccounts
    .flatMap((account) => {
      const reachablePeopleCount = countReachablePeople(account.people);
      const openDealCount = account.deals.length;
      const latestDeal = account.deals[0] ?? null;
      const targets: WorkflowResearchTargetItem[] = [];

      if (needsContactResearch({ people: account.people, openDealCount })) {
        const stats = {
          peopleCount: account.people.length,
          reachablePeopleCount,
          openDealCount,
          latestDealTitle: latestDeal?.title ?? null,
        };
        const activeRun = findActiveResearchBriefRun(activeResearchBriefRuns, {
          accountId: account.id,
          dealId: latestDeal?.id ?? null,
          subjectType: "company",
          objective: "find-contact",
          workspace: account.workspace,
        });
        targets.push({
          id: `account:${account.id}`,
          kind: "account",
          accountId: account.id,
          personId: null,
          name: account.name,
          subject: account.name,
          subjectType: "company",
          workspace: account.workspace,
          type: account.type,
          peopleCount: stats.peopleCount,
          reachablePeopleCount,
          openDealCount,
          latestDealId: latestDeal?.id ?? null,
          latestDealTitle: latestDeal?.title ?? null,
          reason: contactResearchReason(stats),
          activeRunId: activeRun?.id ?? null,
          activeRunStatus: activeRun?.status ?? null,
        });
      }

      for (const person of account.people) {
        if (!needsPersonContactResearch({ person, openDealCount })) continue;
        const subject = personResearchSubject({
          personName: person.name,
          personRole: person.role,
          accountName: account.name,
        });
        const activeRun = findActiveResearchBriefRun(activeResearchBriefRuns, {
          accountId: account.id,
          personId: person.id,
          dealId: latestDeal?.id ?? null,
          subject,
          subjectType: "person",
          objective: "find-contact",
          workspace: account.workspace,
        });
        targets.push({
          id: `person:${person.id}`,
          kind: "person",
          accountId: account.id,
          personId: person.id,
          name: person.name ?? account.name,
          subject,
          subjectType: "person",
          workspace: account.workspace,
          type: person.role ?? "Person",
          peopleCount: account.people.length,
          reachablePeopleCount,
          openDealCount,
          latestDealId: latestDeal?.id ?? null,
          latestDealTitle: latestDeal?.title ?? null,
          reason: personContactResearchReason({
            personName: person.name,
            personRole: person.role,
            accountName: account.name,
            latestDealTitle: latestDeal?.title ?? null,
          }),
          activeRunId: activeRun?.id ?? null,
          activeRunStatus: activeRun?.status ?? null,
        });
      }

      return targets;
    })
    .slice(0, 6);
  const actionTasks = [...overdueTasks, ...dueTasks].map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    dealId: task.deal?.id ?? null,
    dealTitle: task.deal?.title ?? null,
    accountId: task.deal?.account?.id ?? task.account?.id ?? null,
    accountName: task.deal?.account?.name ?? task.account?.name ?? null,
  }));
  const candidateItems = hotCandidates.map((candidate) => {
    const researchSubject = candidateContactResearchSubject(candidate);
    const researchSubjectType = candidate.organization ? "company" as const : "unknown" as const;
    const activeResearchRun = findActiveResearchBriefRun(activeResearchBriefRuns, {
      candidateId: candidate.id,
      subject: researchSubject,
      subjectType: researchSubjectType,
      objective: "find-contact",
      workspace: candidate.workspace,
    });
    return {
      id: candidate.id,
      title: candidate.title,
      missionId: candidate.missionId ?? null,
      laneName: candidate.lane?.name ?? null,
      organization: candidate.organization ?? null,
      sourceName: candidate.sourceName ?? null,
      evidenceSnippet: candidate.evidence[0]?.snippet ?? null,
      pursuitScore: candidate.pursuitScore ?? null,
      workspace: candidate.workspace,
      researchSubject,
      researchSubjectType,
      researchCandidateId: candidate.id,
      activeResearchRunId: activeResearchRun?.id ?? null,
      activeResearchRunStatus: activeResearchRun?.status ?? null,
    };
  });
  const workflowDeal = (deal: (typeof staleDeals)[number]) => ({
    id: deal.id,
    title: deal.title,
    status: deal.status,
    accountName: deal.account?.name ?? null,
    deadline: deal.deadline?.toISOString() ?? null,
    updatedAt: deal.updatedAt.toISOString(),
    nextAction: deal.nextAction ?? null,
  });
  const sourceItems = activeSources.map((source) => ({
    id: source.id,
    name: source.name,
    url: source.url ?? null,
    type: source.type,
    workspace: source.workspace,
    frequency: source.frequency,
    enabled: source.enabled,
    lastCheckedAt: source.lastCheckedAt?.toISOString() ?? null,
    automatable: AUTOMATABLE_SOURCE_TYPES.has(source.type),
    due: AUTOMATABLE_SOURCE_TYPES.has(source.type) && isSourceDue(source, now),
  }));
  const defaultLaneId = lanes.find((lane) => lane.slug === "sme-ai-automation")?.id ?? lanes[0]?.id ?? null;
  const savedSearchItems = savedSearches.map((search) => ({
    id: search.id,
    name: search.name,
    href: savedSearchFiltersToHref(search.filters),
    summary: describeSavedSearchFilters(search.filters),
    createdAt: search.createdAt.toISOString(),
    discoveryPayload: defaultLaneId
      ? savedSearchDiscoveryPayload(search.filters, { laneId: defaultLaneId, name: search.name })
      : null,
  }));
  const alertItems = unreadAlerts.map((alert) => ({
    id: alert.id,
    type: alert.type,
    channel: alert.channel,
    title: alert.title,
    body: alert.body ?? null,
    payload: alertPayload(alert.payload),
    createdAt: alert.createdAt.toISOString(),
  }));
  const laneItems = lanes.map((lane) => ({
    id: lane.id,
    slug: lane.slug,
    name: lane.name,
    description: lane.description,
  }));
  const workflowRunItems = workflowRuns.map((run) => {
    return {
      id: run.id,
      playbook: run.playbook,
      workspace: run.workspace,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      log: run.log,
      summary: workflowRunResultSummary(run.playbook, run.result),
      trigger: run.trigger,
      presetId: run.presetId,
      presetName: run.preset?.name ?? null,
    };
  });
  const discoveryMissionItems: WorkflowDiscoveryMissionItem[] = missions.map((mission) => {
    const visible = visibleMissionCandidateMeta(mission);
    return {
      id: mission.id,
      status: mission.status,
      provider: discoveryMissionProviderLabel(mission),
      startedAt: mission.startedAt.toISOString(),
      finishedAt: mission.finishedAt?.toISOString() ?? null,
      query: mission.query,
      laneName: mission.lane.name,
      warnings: visible.warnings,
      log: mission.log,
      candidateCount: visible.candidateCount,
    };
  });
  const workflowPresetItems: WorkflowPresetPanelItem[] = await Promise.all(
    workflowPresets.map(async (preset) => {
      const input = presetToWorkflowInput(preset);
      const activeRun = activePresetRuns.find((run) => run.presetId === preset.id) ?? null;
      const recentEvents = workflowPresetEvents
        .filter((event) => event.presetId === preset.id)
        .slice(0, 3)
        .map((event) => ({
          id: event.id,
          runId: event.runId,
          eventType: event.eventType,
          reason: event.reason,
          message: event.message,
          createdAt: event.createdAt.toISOString(),
        }));
      return {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        playbook: input.playbook,
        workspace: input.workspace,
        options: input.options ?? {},
        optionSummary: workflowPresetOptionSummary(input.options),
        pinned: preset.pinned,
        scheduleEnabled: preset.scheduleEnabled,
        scheduleIntervalHours: preset.scheduleIntervalHours,
        scheduleNextRunAt: preset.scheduleNextRunAt?.toISOString() ?? null,
        scheduleSummary: workflowPresetScheduleSummary(preset),
        lastScheduledAt: preset.lastScheduledAt?.toISOString() ?? null,
        lastQueuedAt: preset.lastQueuedAt?.toISOString() ?? null,
        updatedAt: preset.updatedAt.toISOString(),
        activeRun: activeRun
          ? {
              id: activeRun.id,
              status: activeRun.status,
              trigger: activeRun.trigger,
              createdAt: activeRun.createdAt.toISOString(),
            }
          : null,
        recentEvents,
        preview: await previewWorkflowRun(ownerId, input, now),
      };
    }),
  );
  const workflowRecommendations: WorkflowRecommendationItem[] = [];
  const pipelineSignalCount = staleDeals.length + upcomingDeadlines.length;
  if (hotCandidates.length && (pipelineSignalCount || dueSourceCount)) {
    workflowRecommendations.push({
      id: "recommended-operating-day",
      title: "Run operating day",
      reason: `${hotCandidates.length} hot candidates, ${pipelineSignalCount} pipeline signals, ${dueSourceCount} due sources.`,
      metric: "best next",
      playbook: "operating-day",
      tone: "primary",
      icon: "sparkles",
      options: {
        operatingDay: {
          dailySweep: dueSourceCount > 0 || openTaskCount > 0,
          candidateHarvest: hotCandidates.length > 0,
          pipelineRescue: pipelineSignalCount > 0,
        },
        dailySweep: {
          includeSources: dueSourceCount > 0,
          includeAlerts: openTaskCount > 0,
        },
        candidateHarvest: {
          minScore: 70,
          limit: Math.min(8, Math.max(1, hotCandidates.length)),
        },
        pipelineRescue: {
          staleDays: 14,
          deadlineDays: 7,
          limit: Math.min(12, Math.max(1, pipelineSignalCount)),
        },
      },
    });
  }
  if (hotCandidates.length) {
    workflowRecommendations.push({
      id: "recommended-candidate-harvest",
      title: "Harvest hot candidates",
      reason: `${hotCandidates.length} new candidates are at or above 70 pursuit score.`,
      metric: `${hotCandidates.length} hot`,
      playbook: "candidate-harvest",
      tone: "warning",
      icon: "target",
      options: {
        candidateHarvest: {
          minScore: 70,
          limit: Math.min(8, Math.max(1, hotCandidates.length)),
        },
      },
    });
  }
  if (pipelineSignalCount) {
    workflowRecommendations.push({
      id: "recommended-pipeline-rescue",
      title: "Rescue pipeline",
      reason: `${staleDeals.length} stale deals and ${upcomingDeadlines.length} upcoming deadlines need next actions.`,
      metric: `${pipelineSignalCount} signals`,
      playbook: "pipeline-rescue",
      tone: "warning",
      icon: "timer",
      options: {
        pipelineRescue: {
          staleDays: 14,
          deadlineDays: 7,
          limit: Math.min(12, Math.max(1, pipelineSignalCount)),
        },
      },
    });
  }
  if (dueSourceCount) {
    workflowRecommendations.push({
      id: "recommended-source-sweep",
      title: "Sweep due sources",
      reason: `${dueSourceCount} enabled automatable sources are due for discovery.`,
      metric: `${dueSourceCount} due`,
      playbook: "daily-sweep",
      tone: "default",
      icon: "database",
      options: {
        dailySweep: {
          includeSources: true,
          includeAlerts: false,
        },
      },
    });
  }
  const visibleWorkflowRecommendations = filterWorkflowRecommendations(workflowRecommendations, runningWorkflowRuns);
  const workflowActivityItems = [
    ...workflowRuns.map((run) => ({
      id: `workflow-run-${run.id}`,
      kind: "workflow" as const,
      title: `${run.playbook.replace(/-/g, " ")} playbook`,
      description: run.preset?.name
        ? `${run.trigger}: ${run.preset.name}`
        : run.log.at(-1) ?? null,
      status: run.status,
      href: `/workflows/runs/${run.id}`,
      createdAt: (run.finishedAt ?? run.startedAt ?? run.createdAt).toISOString(),
    })),
    ...missions.map((mission) => ({
      id: `mission-${mission.id}`,
      kind: "mission" as const,
      title: `${mission.lane.name} mission`,
      description: firstQuery(mission.query),
      status: mission.status,
      href: discoveryMissionHref(mission.id),
      createdAt: (mission.finishedAt ?? mission.startedAt).toISOString(),
    })),
    ...recentSourceRuns.map((run) => ({
      id: `source-run-${run.id}`,
      kind: "source" as const,
      title: run.source?.name ? `Source run: ${run.source.name}` : "Source run",
      description: run.log ?? `Found ${run.foundCount} - ${run.newCount} new - ${run.updatedCount} updated`,
      status: run.status,
      href: "/sources",
      createdAt: (run.finishedAt ?? run.startedAt).toISOString(),
    })),
    ...recentAlerts.map((alert) => ({
      id: `alert-${alert.id}`,
      kind: "alert" as const,
      title: alert.title,
      description: alert.body ?? null,
      status: alert.type,
      href: alertHref(alert.payload),
      createdAt: alert.createdAt.toISOString(),
    })),
    ...recentAssets.map((asset) => ({
      id: `asset-${asset.id}`,
      kind: "asset" as const,
      title: asset.title ?? `${asset.kind.toLowerCase()} asset`,
      description: asset.deal?.title ?? asset.account?.name ?? null,
      status: asset.kind,
      href: asset.deal?.id ? `/deals/${asset.deal.id}` : asset.account?.id ? `/accounts/${asset.account.id}` : "/deals",
      createdAt: asset.createdAt.toISOString(),
    })),
    ...recentOpportunityActivities.map((activity) => ({
      id: `opportunity-activity-${activity.id}`,
      kind: "opportunity" as const,
      title: activity.message,
      description: activity.opportunity.title,
      status: activity.type,
      href: `/opportunities/${activity.opportunity.id}`,
      createdAt: activity.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow command"
        description="Mission control for acquisition work: running searches, queues, stale deals, next actions, and source coverage."
      >
        <Button asChild>
          <Link href="/discover">
            <PlayCircle className="h-4 w-4" />
            Queue discovery
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/deals">
            <BriefcaseBusiness className="h-4 w-4" />
            Pipeline
          </Link>
        </Button>
      </PageHeader>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <ControlMetric label="Running" value={runningMissions.length + runningWorkflowRuns.length} icon={<Radar />} tone="primary" />
        <ControlMetric label="Hot candidates" value={hotCandidates.length} icon={<Target />} tone="warning" />
        <ControlMetric label="Contact gaps" value={contactResearchTargets.length} icon={<Search />} tone="warning" />
        <ControlMetric label="Due actions" value={openTaskCount} icon={<CalendarClock />} tone="warning" />
        <ControlMetric label="Stale deals" value={staleDeals.length} icon={<TimerReset />} tone="default" />
        <ControlMetric label="Open value" value={formatBudget(null, openPipelineValue, "DKK")} icon={<BriefcaseBusiness />} tone="success" />
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Recommended moves
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowRecommendationPanel recommendations={visibleWorkflowRecommendations.slice(0, 4)} />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Radar className="h-4 w-4 text-primary" />
                Discovery runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowDiscoveryMissionQueue missions={discoveryMissionItems} queue={discoveryQueue} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Compass className="h-4 w-4 text-primary" />
                Playbook runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowRunQueue runs={workflowRunItems} queue={workflowQueue} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-warning" />
                Hot candidate triage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowCandidateQueue candidates={candidateItems} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-warning" />
                Action queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowActionQueue tasks={actionTasks} nowIso={now.toISOString()} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4 text-primary" />
                Contact research
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowResearchTargetQueue targets={contactResearchTargets} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TimerReset className="h-4 w-4 text-primary" />
                Stale deals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowDealQueue deals={staleDeals.map(workflowDeal)} mode="stale" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock3 className="h-4 w-4 text-primary" />
                Deadline watch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowDealQueue deals={upcomingDeadlines.map(workflowDeal)} mode="deadline" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-primary" />
                Source coverage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowSourceQueue sources={sourceItems} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4 text-primary" />
                Saved searches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowSavedSearchQueue searches={savedSearchItems} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bell className="h-4 w-4 text-primary" />
                Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowAlertQueue alerts={alertItems} />
            </CardContent>
          </Card>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Compass className="h-4 w-4 text-primary" />
              Operating modes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkflowPresetPanel presets={workflowPresetItems} />
            <WorkflowUsecaseLauncher lanes={laneItems} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Pipeline distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusGroups.map((group) => {
              const meta = DEAL_STATUS_META[group.status];
              return (
                <div key={group.status} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    <span className="truncate">{meta.label}</span>
                  </span>
                  <span className="tnum text-muted-foreground">{group._count._all}</span>
                </div>
              );
            })}
            {statusGroups.length === 0 ? <EmptyLine>No deals yet.</EmptyLine> : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-primary" />
            Recent workflow activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowActivityFeed items={workflowActivityItems} />
        </CardContent>
      </Card>
    </div>
  );
}

function ControlMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone: "primary" | "warning" | "success" | "default";
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    success: "text-success bg-success/10",
    default: "text-muted-foreground bg-surface",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-md", toneClass)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}
