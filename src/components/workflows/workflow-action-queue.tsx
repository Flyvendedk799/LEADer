"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, CheckCircle2, Clock3, Loader2, MoreHorizontal, TimerReset, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { formatDate, relativeDeadline } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/lib/types";

export type WorkflowTaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  dealId: string | null;
  dealTitle: string | null;
  accountName: string | null;
};

function dueClass(dueAt: string | null, nowIso: string) {
  if (!dueAt) return "text-muted-foreground";
  return new Date(dueAt).getTime() < new Date(nowIso).getTime() ? "text-warning" : "text-muted-foreground";
}

function snoozeDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

export function WorkflowActionQueue({
  tasks,
  nowIso,
}: {
  tasks: WorkflowTaskItem[];
  nowIso: string;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(tasks);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const bulkBusy = busyId?.startsWith("bulk:");

  React.useEffect(() => {
    setItems(tasks);
  }, [tasks]);

  async function updateTask(task: WorkflowTaskItem, patch: Partial<Pick<WorkflowTaskItem, "status" | "dueAt">>, label: string) {
    const previous = items;
    setBusyId(task.id);
    setItems((current) =>
      patch.status && patch.status !== "OPEN"
        ? current.filter((item) => item.id !== task.id)
        : current.map((item) => (item.id === task.id ? { ...item, ...patch } : item)),
    );

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.dueAt ? { dueAt: patch.dueAt } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Task update failed");
      toast.success(label);
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Task update failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function updateVisibleTasks(patch: Partial<Pick<WorkflowTaskItem, "status" | "dueAt">>, label: string) {
    const previous = items;
    const ids = items.map((task) => task.id);
    setBusyId(`bulk:${patch.status ?? "dueAt"}`);
    setItems((current) =>
      patch.status && patch.status !== "OPEN" ? [] : current.map((task) => ({ ...task, ...patch })),
    );

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.dueAt ? { dueAt: patch.dueAt } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Task update failed");
      toast.success(label);
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Task update failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No due actions.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busyId)}
          onClick={() => updateVisibleTasks({ dueAt: snoozeDate(1), status: "OPEN" }, "Visible tasks moved to tomorrow")}
        >
          {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TimerReset className="h-4 w-4" />}
          Tomorrow all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="success"
          disabled={Boolean(busyId)}
          onClick={() => updateVisibleTasks({ status: "DONE" }, "Visible tasks completed")}
        >
          {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          Done all
        </Button>
      </div>
      {items.map((task) => {
        const href = task.dealId ? `/deals/${task.dealId}` : "/deals";
        const busy = busyId === task.id;
        return (
          <div
            key={task.id}
            className="grid gap-3 rounded-md border border-border bg-surface/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Link href={href} className="min-w-0 hover:text-primary">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {task.accountName ?? task.dealTitle ?? "No account"} - {task.priority.toLowerCase()}
              </p>
              <p className={`mt-1 inline-flex items-center gap-1 text-xs ${dueClass(task.dueAt, nowIso)}`}>
                <Clock3 className="h-3 w-3" />
                {task.dueAt ? `${relativeDeadline(task.dueAt)} - ${formatDate(task.dueAt)}` : "No due date"}
              </p>
            </Link>

            <div className="flex items-center justify-end gap-2">
              <Badge variant={task.priority === "URGENT" || task.priority === "HIGH" ? "warning" : "outline"}>
                {task.priority.toLowerCase()}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="success"
                disabled={busy}
                onClick={() => updateTask(task, { status: "DONE" }, "Task completed")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Done
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={busy}
                    aria-label="More task actions"
                    title="More task actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => updateTask(task, { dueAt: snoozeDate(1), status: "OPEN" }, "Task moved to tomorrow")}>
                    <TimerReset className="h-4 w-4" />
                    Tomorrow
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateTask(task, { dueAt: snoozeDate(3), status: "OPEN" }, "Task moved three days")}>
                    <TimerReset className="h-4 w-4" />
                    Three days
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateTask(task, { dueAt: snoozeDate(7), status: "OPEN" }, "Task moved one week")}>
                    <TimerReset className="h-4 w-4" />
                    One week
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateTask(task, { status: "DISMISSED" }, "Task dismissed")}>
                    <XCircle className="h-4 w-4" />
                    Dismiss
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}
