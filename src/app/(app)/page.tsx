export const dynamic = "force-dynamic";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Search,
  CheckCircle2,
  CalendarClock,
  BriefcaseBusiness,
} from "lucide-react";
import { requireOwnerId } from "@/lib/auth";
import { getCockpit } from "@/lib/crm";
import { db } from "@/lib/db";
import { workspaceFromRoute } from "@/lib/workspace-context";
import { taskWorkspaceWhere } from "@/lib/tasks/scope";
import { OPEN_STATUSES } from "@/lib/crm/deal-query";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { formatBudget, relativeDeadline } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/tasks/task-list";
import { ScoreBadge } from "@/components/shared/score-badge";

export default async function TodayPage(props: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const searchParams = await props.searchParams;
  const ownerId = await requireOwnerId();
  const workspace = workspaceFromRoute("/", searchParams);
  const [cockpit, reviewCount, values, user, dueCount, overdueCount] =
    await Promise.all([
      getCockpit(ownerId, workspace),
      db.discoveryCandidate.count({
        where: { ownerId, workspace, status: { in: ["NEW", "REVIEWED"] } },
      }),
      db.deal.findMany({
        where: { ownerId, workspace, status: { in: OPEN_STATUSES } },
        select: { valueMin: true, valueMax: true, currency: true },
      }),
      db.user.findUnique({ where: { id: ownerId }, select: { name: true } }),
      db.task.count({
        where: {
          ownerId,
          status: "OPEN",
          ...taskWorkspaceWhere(workspace),
          dueAt: { lte: new Date(Date.now() + 7 * 86400000) },
        },
      }),
      db.task.count({
        where: {
          ownerId,
          status: "OPEN",
          ...taskWorkspaceWhere(workspace),
          dueAt: { lt: new Date() },
        },
      }),
    ]);
  const href = (path: string, query = "") =>
    path + "?workspace=" + workspace + query;
  const amounts = new Map<string, number>();
  for (const deal of values) {
    const currency = deal.currency || "DKK";
    amounts.set(
      currency,
      (amounts.get(currency) || 0) + (deal.valueMax ?? deal.valueMin ?? 0),
    );
  }
  const valueLabel =
    [...amounts]
      .filter(([, amount]) => amount > 0)
      .map(([currency, amount]) => formatBudget(amount, amount, currency))
      .join(" + ") || "—";
  const tasks = [...cockpit.overdueTasks, ...cockpit.dueTasks];
  const firstName = user?.name?.split(" ")[0];
  return (
    <div className="space-y-7 overflow-y-auto scrollbar-thin flex-1 min-h-0 pr-2 pb-12">
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">
          {new Intl.DateTimeFormat("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Europe/Copenhagen",
          }).format(new Date())}{" "}
          · {workspace === "DK" ? "Denmark" : "International"}
        </p>
        <PageHeader
          title={
            firstName ? "Your day, " + firstName + "." : "Your day, in focus."
          }
          description="A little focus. A few good conversations. Your next client starts here."
        >
          <Button asChild variant="outline">
            <Link href={href("/deals", "&new=1")}>
              <Plus className="h-4 w-4" />
              New deal
            </Link>
          </Button>
          <Button asChild>
            <Link href={href("/discover")}>
              <Search className="h-4 w-4" />
              Find leads
            </Link>
          </Button>
        </PageHeader>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Open deals",
            value: String(cockpit.openDeals),
            note: "Conversations worth moving forward",
            url: href("/deals"),
          },
          {
            label: "Leads to review",
            value: String(reviewCount),
            note: "Choose what deserves your time",
            url: href("/inbox"),
          },
          {
            label: "Follow-ups due",
            value: String(dueCount),
            note: overdueCount
              ? overdueCount + " overdue · start here"
              : "Coming up over the next 7 days",
            url: href("/tasks"),
          },
          {
            label: "Open pipeline",
            value: valueLabel,
            note: "Estimated value · before qualification",
            url: href("/deals", "&sort=value"),
          },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.url}
            className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex justify-between text-sm text-muted-foreground">
              {stat.label}
              <ArrowUpRight className="h-4 w-4 opacity-40 group-hover:text-primary group-hover:opacity-100" />
            </div>
            <p className="my-3 break-words text-3xl font-semibold tracking-tight tnum">
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.note}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-primary">
                  MAKE PROGRESS
                </p>
                <h2 className="text-lg font-semibold">Your next moves</h2>
              </div>
              <Link
                href={href("/tasks")}
                className="flex items-center gap-1 text-xs font-medium text-primary"
              >
                All tasks <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <TaskList tasks={tasks.slice(0, 6)} compact />
            {tasks.length === 0 && (
              <Button asChild variant="outline" className="mt-4">
                <Link href={href("/tasks")}>Plan your next follow-up</Link>
              </Button>
            )}
          </section>
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="mb-5 flex justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-primary">
                  WORTH A LOOK
                </p>
                <h2 className="text-lg font-semibold">Promising discoveries</h2>
              </div>
              <Link
                href={href("/inbox")}
                className="text-xs font-medium text-primary"
              >
                Review inbox →
              </Link>
            </div>
            {cockpit.hotCandidates.length ? (
              <div className="divide-y">
                {cockpit.hotCandidates.slice(0, 4).map((candidate) => (
                  <Link
                    key={candidate.id}
                    href={href("/inbox", "&candidate=" + candidate.id)}
                    className="flex items-center gap-4 py-4 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-6 hover:text-primary">
                        {candidate.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.organization ||
                          candidate.sourceName ||
                          "Discovery"}{" "}
                        · {candidate.lane?.name}
                      </p>
                    </div>
                    <ScoreBadge score={candidate.pursuitScore} size="sm" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-background p-6">
                <Search className="mb-3 h-6 w-6 text-primary" />
                <h3 className="font-medium">Make room for your next client</h3>
                <p className="mb-4 mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Find funded projects, software assignments, and companies that
                  need your skills. Save the promising ones to your pipeline.
                </p>
                <Button asChild size="sm">
                  <Link href={href("/discover")}>
                    Start a focused search <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-6">
            <h2 className="mb-5 flex items-center gap-2 font-semibold">
              <BriefcaseBusiness className="h-4 w-4 text-primary" />
              Pipeline snapshot
            </h2>
            <div className="space-y-4">
              {OPEN_STATUSES.map((status) => {
                const count =
                  cockpit.byStatus.find((row) => row.status === status)
                    ?.count || 0;
                return (
                  <Link
                    key={status}
                    href={href("/deals", "&status=" + status)}
                    className="block"
                  >
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {DEAL_STATUS_META[status].label}
                      </span>
                      <span className="tnum font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{
                          width:
                            (count / Math.max(cockpit.openDeals, 1)) * 100 +
                            "%",
                        }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href={href("/board")}>
                Open pipeline board <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </section>
          <section className="rounded-xl border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold">
              <CalendarClock className="h-4 w-4 text-primary" />
              On the horizon
            </h2>
            {cockpit.upcomingDeadlines.length ? (
              <div className="space-y-4">
                {cockpit.upcomingDeadlines.slice(0, 4).map((deal) => (
                  <Link
                    key={deal.id}
                    href={"/deals/" + deal.id}
                    className="block"
                  >
                    <p className="text-sm font-medium hover:text-primary">
                      {deal.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {relativeDeadline(deal.deadline)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                No upcoming deadlines. Add a due date to a deal to keep it on
                your radar.
              </p>
            )}
          </section>
          <div className="flex items-center gap-3 rounded-xl bg-primary/5 p-5">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">
                {cockpit.wonDeals} deals won
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Keep showing up. Progress adds up.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
