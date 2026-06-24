import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3, ExternalLink, ListChecks, RotateCw, Search, Sparkles, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { WorkflowRunControls } from "@/components/workflows/workflow-run-controls";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { discoveryCandidateHref } from "@/lib/discovery-links";
import { formatDate, truncate } from "@/lib/utils";
import { recoverWorkflowQueue } from "@/lib/workflows/queue";
import { researchBriefRunbookFromResult, researchBriefWorksheetFromResult } from "@/lib/workflows/research-brief-result";
import { researchSearchHref, uniqueResearchPrompts } from "@/lib/workflows/research-links";
import { workflowRunResultSummary } from "@/lib/workflows/result-summary";
import { workflowResearchLinkedTargets } from "@/lib/workflows/linked-context";
import { workflowTaskHref } from "@/lib/workflows/task-links";

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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function compactJson(value: unknown) {
  if (!value || typeof value !== "object") return "Default";
  return JSON.stringify(value);
}

export default async function WorkflowRunDetailPage({ params }: { params: { id: string } }) {
  const ownerId = await requireOwnerId();
  const queue = await recoverWorkflowQueue(ownerId);

  const run = await db.workflowRun.findFirst({
    where: { id: params.id, ownerId },
    include: { preset: { select: { name: true } } },
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
  const linked = objectValue(result?.linked);
  const linkedCandidateId = stringValue(linked?.candidateId);
  const linkedCandidateMissionId = stringValue(linked?.candidateMissionId);
  const linkedCandidateTitle = stringValue(linked?.candidateTitle);
  const linkedCandidateUrl = stringValue(linked?.candidateUrl);
  const linkedCandidateEvidence = stringValue(linked?.candidateEvidence);
  const linkedCandidateHref = linkedCandidateId && linkedCandidateMissionId
    ? discoveryCandidateHref(linkedCandidateMissionId, linkedCandidateId)
    : "";
  const linkedTargets = workflowResearchLinkedTargets(linked);
  const operatingSources = objectValue(dailySweep?.sources);
  const operatingDigest = objectValue(dailySweep?.digest);
  const operatingCandidates = objectValue(candidateHarvest?.candidates);
  const operatingStaleDeals = objectValue(pipelineRescue?.staleDeals);
  const operatingDeadlines = objectValue(pipelineRescue?.deadlines);
  const operatingRescueTasks =
    numberValue(operatingStaleDeals?.tasksCreated) + numberValue(operatingDeadlines?.tasksCreated);
  const checklist = Array.isArray(result?.checklist) ? result.checklist.filter((item) => objectValue(item)) : [];
  const worksheet =
    run.playbook === "research-brief"
      ? researchBriefWorksheetFromResult(result, run.workspace, input)
      : Array.isArray(result?.worksheet)
        ? result.worksheet.filter((item) => objectValue(item))
        : [];
  const runbook =
    run.playbook === "research-brief"
      ? researchBriefRunbookFromResult(result, run.workspace, input)
      : Array.isArray(result?.runbook)
        ? result.runbook.filter((item) => objectValue(item))
        : [];
  const taskIds = [...new Set([...stringList(result?.taskIds), ...stringList(result?.existingTaskIds)])];
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

      <WorkflowRunControls
        run={{
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
        }}
        queue={queue}
      />

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
      ) : run.playbook === "research-brief" ? (
        <section className="grid gap-3 md:grid-cols-4">
          <RunMetric label="Subject" value={typeof result?.subject === "string" ? truncate(result.subject, 28) : "Research"} icon={<Search />} />
          <RunMetric label="Created tasks" value={numberValue(result?.createdTasks)} icon={<ListChecks />} />
          <RunMetric label="Existing tasks" value={numberValue(result?.skippedExistingTasks)} icon={<CheckCircle2 />} />
          <RunMetric label="Runbook" value={runbook.length || worksheet.length || checklist.length} icon={<Target />} />
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

      {run.playbook === "research-brief" && linkedTargets.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Linked CRM context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              {linkedTargets.map((target) => {
                const content = (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline">{target.kind}</Badge>
                      <p className="truncate text-sm font-medium">{target.label}</p>
                    </div>
                    {target.detail ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{target.detail}</p>
                    ) : null}
                  </>
                );
                const className =
                  "rounded-md border border-border bg-surface/40 p-3 transition-colors hover:border-primary/50";
                return target.href ? (
                  <Link key={`${target.kind}-${target.label}`} href={target.href} className={className}>
                    {content}
                  </Link>
                ) : (
                  <div key={`${target.kind}-${target.label}`} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {run.playbook === "research-brief" && (linkedCandidateId || linkedCandidateTitle || linkedCandidateUrl) ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Linked discovery candidate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {linkedCandidateTitle || linkedCandidateId || "Discovery candidate"}
                </p>
                {linkedCandidateEvidence ? (
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {truncate(linkedCandidateEvidence, 420)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {linkedCandidateHref ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={linkedCandidateHref}>
                      <Target className="h-4 w-4" />
                      Open candidate
                    </Link>
                  </Button>
                ) : null}
                {linkedCandidateUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={linkedCandidateUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Source
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {run.playbook === "research-brief" && runbook.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Operator runbook</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 lg:grid-cols-2">
              {runbook.map((raw, index) => {
                const step = objectValue(raw)!;
                const title = typeof step.title === "string" ? step.title : `Runbook step ${index + 1}`;
                const goal = typeof step.goal === "string" ? step.goal : "";
                const capture = stringList(step.capture);
                const stopWhen = typeof step.stopWhen === "string" ? step.stopWhen : "";
                const prompts = uniqueResearchPrompts(step.searchPrompts, 5);
                const routePriority = stringList(step.routePriority);
                return (
                  <div key={`${title}-${index}`} className="rounded-md border border-border bg-surface/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <p className="text-sm font-medium">{title}</p>
                    </div>
                    {goal ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{goal}</p> : null}
                    {capture.length ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Capture</p>
                        <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                          {capture.slice(0, 5).map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {routePriority.length ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Route priority</p>
                        <ol className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                          {routePriority.slice(0, 4).map((item, routeIndex) => (
                            <li key={item} className="flex gap-2">
                              <span className="shrink-0 tabular-nums">{routeIndex + 1}.</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {stopWhen ? (
                      <p className="mt-3 rounded-md border border-border/70 bg-background/45 p-2 text-xs leading-5 text-muted-foreground">
                        {stopWhen}
                      </p>
                    ) : null}
                    <SearchPromptLinks prompts={prompts} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {run.playbook === "research-brief" && checklist.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Research checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 lg:grid-cols-2">
              {checklist.map((raw, index) => {
                const step = objectValue(raw)!;
                const title = typeof step.title === "string" ? step.title : `Research step ${index + 1}`;
                const stage = typeof step.stage === "string" ? step.stage : "step";
                const priority = typeof step.priority === "string" ? step.priority : "MEDIUM";
                const prompts = uniqueResearchPrompts(step.searchPrompts, 4);
                const criteria = stringList(step.acceptanceCriteria);
                const description = typeof step.description === "string" ? step.description : "";
                return (
                  <div key={`${stage}-${index}`} className="rounded-md border border-border bg-surface/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{stage}</Badge>
                      <Badge variant={priority === "URGENT" || priority === "HIGH" ? "warning" : "outline"}>
                        {priority.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">{title}</p>
                    {description ? (
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                        {truncate(description.replace(/\n+/g, " "), 260)}
                      </p>
                    ) : null}
                    {criteria.length ? (
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                        {criteria.slice(0, 3).map((criterion) => (
                          <li key={criterion} className="flex gap-2">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                            <span>{criterion}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <SearchPromptLinks prompts={prompts} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {run.playbook === "research-brief" && worksheet.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Research worksheet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 lg:grid-cols-2">
              {worksheet.map((raw, index) => {
                const section = objectValue(raw)!;
                const title = typeof section.title === "string" ? section.title : `Worksheet section ${index + 1}`;
                const purpose = typeof section.purpose === "string" ? section.purpose : "";
                const fields = Array.isArray(section.fields)
                  ? section.fields.filter((field) => objectValue(field))
                  : [];
                return (
                  <div key={`${title}-${index}`} className="rounded-md border border-border bg-surface/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{typeof section.id === "string" ? section.id : "worksheet"}</Badge>
                      <p className="text-sm font-medium">{title}</p>
                    </div>
                    {purpose ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{purpose}</p> : null}
                    <div className="mt-3 space-y-2">
                      {fields.map((fieldRaw, fieldIndex) => {
                        const field = objectValue(fieldRaw)!;
                        const label = typeof field.label === "string" ? field.label : `Field ${fieldIndex + 1}`;
                        const capture = typeof field.capture === "string" ? field.capture : "";
                        const evidence = typeof field.evidence === "string" ? field.evidence : "";
                        const prompts = uniqueResearchPrompts(field.sourcePrompts, 3);
                        return (
                          <div key={`${label}-${fieldIndex}`} className="rounded-md border border-border/70 bg-background/45 p-2">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
                            {capture ? <p className="mt-1 text-sm leading-5">{capture}</p> : null}
                            {evidence ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{evidence}</p> : null}
                            <SearchPromptLinks prompts={prompts} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
            <KeyValue label="Trigger" value={run.trigger} />
            <KeyValue label="Preset" value={run.preset?.name ?? "None"} />
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
                  href={workflowTaskHref(task)}
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

function SearchPromptLinks({ prompts }: { prompts: unknown }) {
  const items = uniqueResearchPrompts(prompts, 4);
  if (!items.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((prompt) => (
        <a
          key={prompt}
          href={researchSearchHref(prompt)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
          title={prompt}
        >
          <Search className="h-3 w-3 shrink-0" />
          <span className="max-w-[15rem] truncate">{prompt}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ))}
    </div>
  );
}
