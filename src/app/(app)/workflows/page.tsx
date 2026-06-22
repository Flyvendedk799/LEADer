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
import { WorkflowPresetPanel, type WorkflowPresetPanelItem } from "@/components/workflows/workflow-preset-panel";
import { WorkflowRunQueue } from "@/components/workflows/workflow-run-queue";
import { WorkflowSavedSearchQueue } from "@/components/workflows/workflow-saved-search-queue";
import { WorkflowSourceQueue } from "@/components/workflows/workflow-source-queue";
import { WorkflowRecommendationPanel, type WorkflowRecommendationItem } from "@/components/workflows/workflow-recommendation-panel";
import { WorkflowUsecaseLauncher } from "@/components/workflows/workflow-usecase-launcher";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDefaultDiscoveryLanes } from "@/lib/crm/lanes";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { discoveryMissionHref } from "@/lib/discovery-links";
import { isSourceDue } from "@/lib/ingestion";
import { describeSavedSearchFilters, savedSearchFiltersToHref } from "@/lib/saved-searches";
import { cn, formatBudget } from "@/lib/utils";
import { ensureDefaultWorkflowPresets, presetToWorkflowInput, workflowPresetOptionSummary, workflowPresetScheduleSummary } from "@/lib/workflows/presets";
import { previewWorkflowRun } from "@/lib/workflows/preview";
import { recoverWorkflowQueue } from "@/lib/workflows/queue";
import { workflowRunResultSummary } from "@/lib/workflows/result-summary";

export const dynamic = "force-dynamic";

const OPEN_DEAL_STATUSES = ["DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const;
const AUTOMATABLE_SOURCE_TYPES = new Set(["RSS", "NEWSLETTER", "PUBLIC_WEB", "PROCUREMENT", "ACCELERATOR", "API"]);

function missionVariant(status: string) {
  if (status === "SUCCESS") return "success";
  if (status === "ERROR") return "warning";
  if (status === "RUNNING" || status === "QUEUED") return "secondary";
  return "outline";
}

function duration(start?: Date | null, end?: Date | null) {
  if (!start) return "";
  const endMs = end?.getTime() ?? Date.now();
  const seconds = Math.max(0, Math.round((endMs - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function firstQuery(value = "") {
  return value.split("\n").map((item) => item.trim()).filter(Boolean)[0] || "Discovery mission";
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
  const workflowQueue = await recoverWorkflowQueue(ownerId);

  const [
    lanes,
    missions,
    workflowRuns,
    workflowPresets,
    hotCandidates,
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
      include: { lane: true, _count: { select: { candidates: true } } },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    db.workflowRun.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.workflowPreset.findMany({
      where: { ownerId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    db.discoveryCandidate.findMany({
      where: { ownerId, status: "NEW", pursuitScore: { gte: 70 } },
      include: { lane: true, evidence: { take: 1, orderBy: { createdAt: "desc" } } },
      orderBy: [{ pursuitScore: "desc" }, { createdAt: "desc" }],
      take: 8,
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
  const actionTasks = [...overdueTasks, ...dueTasks].map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    dealId: task.deal?.id ?? null,
    dealTitle: task.deal?.title ?? null,
    accountName: task.deal?.account?.name ?? task.account?.name ?? null,
  }));
  const candidateItems = hotCandidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    missionId: candidate.missionId ?? null,
    laneName: candidate.lane?.name ?? null,
    organization: candidate.organization ?? null,
    sourceName: candidate.sourceName ?? null,
    evidenceSnippet: candidate.evidence[0]?.snippet ?? null,
    pursuitScore: candidate.pursuitScore ?? null,
  }));
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
  }));
  const savedSearchItems = savedSearches.map((search) => ({
    id: search.id,
    name: search.name,
    href: savedSearchFiltersToHref(search.filters),
    summary: describeSavedSearchFilters(search.filters),
    createdAt: search.createdAt.toISOString(),
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
    };
  });
  const workflowPresetItems: WorkflowPresetPanelItem[] = await Promise.all(
    workflowPresets.map(async (preset) => {
      const input = presetToWorkflowInput(preset);
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
  const workflowActivityItems = [
    ...workflowRuns.map((run) => ({
      id: `workflow-run-${run.id}`,
      kind: "workflow" as const,
      title: `${run.playbook.replace(/-/g, " ")} playbook`,
      description: run.log.at(-1) ?? null,
      status: run.status,
      href: "/workflows",
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ControlMetric label="Running" value={runningMissions.length + runningWorkflowRuns.length} icon={<Radar />} tone="primary" />
        <ControlMetric label="Hot candidates" value={hotCandidates.length} icon={<Target />} tone="warning" />
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
          <WorkflowRecommendationPanel recommendations={workflowRecommendations.slice(0, 4)} />
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
            <CardContent className="space-y-2">
              {missions.map((mission) => (
                <Link
                  key={mission.id}
                  href={discoveryMissionHref(mission.id)}
                  className="grid gap-2 rounded-md border border-border bg-surface/40 p-3 hover:border-primary/50 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{mission.lane.name}</p>
                      <Badge variant={missionVariant(mission.status)}>{mission.status.toLowerCase()}</Badge>
                      {mission.provider ? <Badge variant="outline">{mission.provider}</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{firstQuery(mission.query)}</p>
                    {mission.warnings.length ? (
                      <p className="mt-1 truncate text-xs text-warning">{mission.warnings[0]}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground md:justify-end">
                    <span>{duration(mission.startedAt, mission.finishedAt)}</span>
                    <span>{mission._count.candidates} candidates</span>
                  </div>
                </Link>
              ))}
              {missions.length === 0 ? <EmptyLine>No discovery runs yet.</EmptyLine> : null}
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
