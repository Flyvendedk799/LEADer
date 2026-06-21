export const dynamic = "force-dynamic";

import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, CalendarClock, CheckCircle2, Search, Target, TimerReset } from "lucide-react";

import { requireOwnerId } from "@/lib/auth";
import { getCockpit } from "@/lib/crm";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { formatBudget, formatDate, relativeDeadline } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreBadge } from "@/components/shared/score-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";

export default async function CockpitPage() {
  const ownerId = await requireOwnerId();
  const cockpit = await getCockpit(ownerId, "DK");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client cockpit"
        description="Today’s acquisition queue: discover, qualify, follow up, and convert."
      >
        <Button asChild>
          <Link href="/discover">
            <Search className="h-4 w-4" />
            Run discovery
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/deals">
            <BriefcaseBusiness className="h-4 w-4" />
            Deals
          </Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Open deals" value={cockpit.openDeals} accent="primary" icon={<BriefcaseBusiness />} />
        <StatCard label="Hot candidates" value={cockpit.hotCandidates.length} accent="warning" icon={<Target />} />
        <StatCard label="Overdue" value={cockpit.overdueTasks.length} accent="warning" icon={<AlertTriangle />} />
        <StatCard label="Due this week" value={cockpit.dueTasks.length} accent="default" icon={<CalendarClock />} />
        <StatCard label="Won / Lost" value={`${cockpit.wonDeals} / ${cockpit.lostDeals}`} accent="success" icon={<CheckCircle2 />} />
        <StatCard label="Pipeline value" value={formatBudget(null, cockpit.pipelineValue, "DKK")} accent="success" icon={<TimerReset />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Today queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...cockpit.overdueTasks, ...cockpit.dueTasks].slice(0, 10).map((task) => (
                <Link
                  key={task.id}
                  href={task.deal ? `/deals/${task.deal.id}` : "/deals"}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 hover:border-primary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.deal?.account?.name ?? "No account"} · {task.dueAt ? relativeDeadline(task.dueAt) : "No due date"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(task.dueAt)}</span>
                </Link>
              ))}
              {cockpit.overdueTasks.length + cockpit.dueTasks.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No urgent follow-ups. Nice clean slate.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Hot discovery candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cockpit.hotCandidates.map((candidate) => (
                <Link
                  key={candidate.id}
                  href="/discover"
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 hover:border-primary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{candidate.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {candidate.lane?.name ?? "Discovery"} · {candidate.organization ?? candidate.sourceName ?? "Unknown account"}
                    </p>
                  </div>
                  <ScoreBadge score={candidate.pursuitScore} size="sm" />
                </Link>
              ))}
              {cockpit.hotCandidates.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No hot unsaved candidates yet. Run a lane to fill this.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pipeline by stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cockpit.byStatus.map((row) => {
                const meta = DEAL_STATUS_META[row.status];
                return (
                  <div key={row.status} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                    <span className="tnum text-muted-foreground">{row.count}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Upcoming deadlines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cockpit.upcomingDeadlines.map((deal) => (
                <Link key={deal.id} href={`/deals/${deal.id}`} className="block rounded-md border border-border bg-surface/40 px-3 py-2 hover:border-primary/50">
                  <p className="truncate text-sm font-medium">{deal.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {deal.account?.name ?? "No account"} · {relativeDeadline(deal.deadline)}
                  </p>
                </Link>
              ))}
              {cockpit.upcomingDeadlines.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No active deadlines.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
