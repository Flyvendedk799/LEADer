import Link from "next/link";
import type { ReactNode } from "react";
import {
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
  Target,
  TimerReset,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowActionQueue } from "@/components/workflows/workflow-action-queue";
import { WorkflowCandidateQueue } from "@/components/workflows/workflow-candidate-queue";
import { WorkflowDealQueue } from "@/components/workflows/workflow-deal-queue";
import { WorkflowSourceQueue } from "@/components/workflows/workflow-source-queue";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { discoveryMissionHref } from "@/lib/discovery-links";
import { cn, formatBudget, formatDate, relativeDeadline, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OPEN_DEAL_STATUSES = ["DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const;

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

function freshness(date?: Date | null) {
  if (!date) return "Never";
  return relativeDeadline(date);
}

export default async function WorkflowsPage() {
  const ownerId = await requireOwnerId();
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const staleCutoff = new Date(now.getTime() - 14 * 86400000);

  const [
    missions,
    hotCandidates,
    overdueTasks,
    dueTasks,
    staleDeals,
    upcomingDeadlines,
    activeSources,
    savedSearches,
    unreadAlerts,
    statusGroups,
    pipelineValue,
  ] = await Promise.all([
    db.discoveryMission.findMany({
      where: { ownerId },
      include: { lane: true, _count: { select: { candidates: true } } },
      orderBy: { startedAt: "desc" },
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
  const openTaskCount = overdueTasks.length + dueTasks.length;
  const openPipelineValue = pipelineValue._sum.valueMax ?? pipelineValue._sum.valueMin ?? 0;
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
        <ControlMetric label="Running" value={runningMissions.length} icon={<Radar />} tone="primary" />
        <ControlMetric label="Hot candidates" value={hotCandidates.length} icon={<Target />} tone="warning" />
        <ControlMetric label="Due actions" value={openTaskCount} icon={<CalendarClock />} tone="warning" />
        <ControlMetric label="Stale deals" value={staleDeals.length} icon={<TimerReset />} tone="default" />
        <ControlMetric label="Open value" value={formatBudget(null, openPipelineValue, "DKK")} icon={<BriefcaseBusiness />} tone="success" />
      </section>

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
            <CardContent className="space-y-2">
              {savedSearches.map((search) => (
                <Link key={search.id} href="/opportunities" className="block rounded-md border border-border bg-surface/40 p-3 hover:border-primary/50">
                  <p className="truncate text-sm font-medium">{search.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Created {formatDate(search.createdAt)}</p>
                </Link>
              ))}
              {savedSearches.length === 0 ? <EmptyLine>No saved searches.</EmptyLine> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bell className="h-4 w-4 text-primary" />
                Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unreadAlerts.map((alert) => (
                <Link key={alert.id} href="/" className="block rounded-md border border-border bg-surface/40 p-3 hover:border-primary/50">
                  <p className="truncate text-sm font-medium">{alert.title}</p>
                  {alert.body ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{truncate(alert.body, 120)}</p> : null}
                </Link>
              ))}
              {unreadAlerts.length === 0 ? <EmptyLine>No unread alerts.</EmptyLine> : null}
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
          <CardContent className="grid gap-3 md:grid-cols-3">
            <ModeCard title="Find work" body="Queue a lane, review hot candidates, save the strongest into deals." href="/discover" icon={<Radar />} />
            <ModeCard title="Advance deals" body="Clear overdue tasks, revive stale deals, prepare outreach and proposals." href="/deals" icon={<BriefcaseBusiness />} />
            <ModeCard title="Expand surface area" body="Add sources, saved searches, and manual community captures." href="/sources" icon={<Database />} />
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

function ModeCard({
  title,
  body,
  href,
  icon,
}: {
  title: string;
  body: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link href={href} className="rounded-md border border-border bg-surface/40 p-3 hover:border-primary/50">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </Link>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}
