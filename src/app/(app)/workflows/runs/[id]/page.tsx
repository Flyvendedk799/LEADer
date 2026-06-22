import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3, ListChecks, RotateCw, Sparkles, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, truncate } from "@/lib/utils";
import { recoverWorkflowQueue } from "@/lib/workflows/queue";

export const dynamic = "force-dynamic";

function statusVariant(status: string) {
  if (status === "SUCCESS") return "success";
  if (status === "ERROR") return "warning";
  if (status === "CANCELED") return "muted";
  if (status === "RUNNING" || status === "QUEUED") return "secondary";
  return "outline";
}

function playbookLabel(playbook: string) {
  return playbook
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function compactJson(value: unknown) {
  if (!value || typeof value !== "object") return "Default";
  return JSON.stringify(value);
}

export default async function WorkflowRunDetailPage({ params }: { params: { id: string } }) {
  const ownerId = await requireOwnerId();
  await recoverWorkflowQueue(ownerId);

  const run = await db.workflowRun.findFirst({
    where: { id: params.id, ownerId },
  });
  if (!run) notFound();

  const result = objectValue(run.result);
  const input = objectValue(run.input);
  const sources = objectValue(result?.sources);
  const reminders = objectValue(result?.reminders);
  const digest = objectValue(result?.digest);
  const staleDeals = objectValue(result?.staleDeals);
  const deadlines = objectValue(result?.deadlines);
  const candidates = objectValue(result?.candidates);
  const dailySweep = objectValue(result?.dailySweep);
  const candidateHarvest = objectValue(result?.candidateHarvest);
  const pipelineRescue = objectValue(result?.pipelineRescue);
  const operatingSources = objectValue(dailySweep?.sources);
  const operatingDigest = objectValue(dailySweep?.digest);
  const operatingCandidates = objectValue(candidateHarvest?.candidates);
  const operatingStaleDeals = objectValue(pipelineRescue?.staleDeals);
  const operatingDeadlines = objectValue(pipelineRescue?.deadlines);
  const operatingRescueTasks =
    numberValue(operatingStaleDeals?.tasksCreated) + numberValue(operatingDeadlines?.tasksCreated);
  const taskIds = stringList(result?.taskIds);
  const dealIds = stringList(result?.dealIds);
  const tasks = taskIds.length
    ? await db.task.findMany({
        where: { ownerId, id: { in: taskIds } },
        include: { deal: { include: { account: true } }, account: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const deals = dealIds.length
    ? await db.deal.findMany({
        where: { ownerId, id: { in: dealIds } },
        include: { account: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={playbookLabel(run.playbook)}
        description="Durable playbook run: status, full log, result summary, and created work."
      >
        <Button asChild variant="outline">
          <Link href="/workflows">
            <ArrowLeft className="h-4 w-4" />
            Workflows
          </Link>
        </Button>
      </PageHeader>

      <section className="grid gap-3 md:grid-cols-4">
        <RunMetric label="Status" value={run.status.toLowerCase()} icon={<Activity />} badge={run.status} />
        <RunMetric label="Workspace" value={run.workspace} icon={<BriefcaseBusiness />} />
        <RunMetric label="Started" value={run.startedAt ? formatDate(run.startedAt) : "Not started"} icon={<Clock3 />} />
        <RunMetric label="Finished" value={run.finishedAt ? formatDate(run.finishedAt) : "Running"} icon={<CheckCircle2 />} />
      </section>

      {run.playbook === "operating-day" ? (
        <section className="grid gap-3 md:grid-cols-4">
          <RunMetric label="Source leads" value={numberValue(operatingSources?.created)} icon={<RotateCw />} />
          <RunMetric label="Saved deals" value={numberValue(operatingCandidates?.saved)} icon={<BriefcaseBusiness />} />
          <RunMetric label="Rescue tasks" value={operatingRescueTasks} icon={<Sparkles />} />
          <RunMetric label="Digests" value={numberValue(operatingDigest?.created)} icon={<ListChecks />} />
        </section>
      ) : run.playbook === "candidate-harvest" ? (
        <section className="grid gap-3 md:grid-cols-4">
          <RunMetric label="Reviewed" value={numberValue(candidates?.reviewed)} icon={<Target />} />
          <RunMetric label="Saved deals" value={numberValue(candidates?.saved)} icon={<BriefcaseBusiness />} />
          <RunMetric label="Already in pipe" value={numberValue(candidates?.alreadyInPipeline)} icon={<CheckCircle2 />} />
          <RunMetric label="Min score" value={numberValue(candidates?.minScore)} icon={<ListChecks />} />
        </section>
      ) : run.playbook === "pipeline-rescue" ? (
        <section className="grid gap-3 md:grid-cols-4">
          <RunMetric label="Stale tasks" value={numberValue(staleDeals?.tasksCreated)} icon={<RotateCw />} />
          <RunMetric label="Deadline tasks" value={numberValue(deadlines?.tasksCreated)} icon={<CalendarClock />} />
          <RunMetric label="Next actions" value={numberValue(result?.nextActionsUpdated)} icon={<ListChecks />} />
          <RunMetric label="Skipped existing" value={numberValue(result?.skippedExistingTasks)} icon={<CheckCircle2 />} />
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-4">
          <RunMetric label="Sources ran" value={numberValue(sources?.ran)} icon={<RotateCw />} />
          <RunMetric label="New leads" value={numberValue(sources?.created)} icon={<BriefcaseBusiness />} />
          <RunMetric label="Reminders" value={numberValue(reminders?.created)} icon={<CalendarClock />} />
          <RunMetric label="Digests" value={numberValue(digest?.created)} icon={<ListChecks />} />
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Activity log</CardTitle>
          </CardHeader>
          <CardContent>
            {run.log.length ? (
              <ol className="space-y-2">
                {run.log.map((entry, index) => (
                  <li key={`${entry}-${index}`} className="rounded-md border border-border bg-surface/40 p-3 font-mono text-[11px] text-muted-foreground">
                    {entry}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No log entries yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Run input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KeyValue label="Playbook" value={run.playbook} />
            <KeyValue label="Workspace" value={String(input?.workspace ?? run.workspace)} />
            <KeyValue label="Options" value={compactJson(input?.options)} />
            <KeyValue label="Created" value={formatDate(run.createdAt)} />
            <KeyValue label="Updated" value={formatDate(run.updatedAt)} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Created work</CardTitle>
        </CardHeader>
        <CardContent>
          {deals.length || tasks.length ? (
            <div className="space-y-2">
              {deals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  className="grid gap-2 rounded-md border border-border bg-surface/40 p-3 transition-colors hover:border-primary/50 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{deal.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {deal.account?.name ?? "No account"} - {deal.nextAction ? truncate(deal.nextAction, 90) : "No next action"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground md:justify-end">
                    <Badge variant="secondary">{deal.status.toLowerCase()}</Badge>
                    <span className="whitespace-nowrap">{deal.pursuitScore ?? 0} score</span>
                  </div>
                </Link>
              ))}
              {tasks.map((task) => (
                <Link
                  key={task.id}
                  href={task.dealId ? `/deals/${task.dealId}` : "/workflows"}
                  className="grid gap-2 rounded-md border border-border bg-surface/40 p-3 transition-colors hover:border-primary/50 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {task.deal?.account?.name ?? task.account?.name ?? "No account"} - {task.deal?.title ? truncate(task.deal.title, 80) : "No deal"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground md:justify-end">
                    <Badge variant={task.priority === "URGENT" || task.priority === "HIGH" ? "warning" : "outline"}>
                      {task.priority.toLowerCase()}
                    </Badge>
                    <span className="whitespace-nowrap">{task.dueAt ? formatDate(task.dueAt) : "No due date"}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No linked tasks were created by this run.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RunMetric({
  label,
  value,
  icon,
  badge,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-normal">{value}</p>
          {badge ? <Badge variant={statusVariant(badge)} className="mt-2">{badge.toLowerCase()}</Badge> : null}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[14rem] truncate text-right font-medium">{value}</span>
    </div>
  );
}
