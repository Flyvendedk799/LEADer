import Link from "next/link";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceFromRoute } from "@/lib/workspace-context";
import { taskWorkspaceWhere } from "@/lib/tasks/scope";
import { OPEN_STATUSES } from "@/lib/crm/deal-query";
import { PageHeader } from "@/components/shared/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { NewTask } from "@/components/tasks/new-task";
import { cn } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function TasksPage(props: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const searchParams = await props.searchParams;
  const ownerId = await requireOwnerId();
  const workspace = workspaceFromRoute("/tasks", searchParams);
  const view =
    typeof searchParams.view === "string" ? searchParams.view : "open";
  const now = new Date();
  const [tasks, deals] = await Promise.all([
    db.task.findMany({
      where: {
        ownerId,
        ...taskWorkspaceWhere(workspace),
        status: view === "done" ? "DONE" : "OPEN",
        ...(view === "overdue" ? { dueAt: { lt: now } } : {}),
      },
      include: { deal: { select: { id: true, title: true } } },
      orderBy:
        view === "done"
          ? { completedAt: "desc" }
          : [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    }),
    db.deal.findMany({
      where: { ownerId, workspace, status: { in: OPEN_STATUSES } },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="shrink-0 space-y-6">
        <PageHeader
          title="Tasks"
          description="Keep your promises. Every follow-up, next step, and personal reminder in one place."
        />
        <NewTask deals={deals} />
        <div className="flex gap-1 border-b pb-3">
          {[
            ["open", "Open tasks"],
            ["overdue", "Overdue"],
            ["done", "Completed"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`/tasks?workspace=${workspace}&view=${value}`}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium",
                view === value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin rounded-xl border bg-card px-5">
        <TaskList tasks={tasks} />
      </div>
      {tasks.length === 200 && (
        <p className="shrink-0 text-xs text-muted-foreground">
          Showing the first 200 tasks. Complete older tasks to keep this list
          manageable.
        </p>
      )}
    </div>
  );
}
