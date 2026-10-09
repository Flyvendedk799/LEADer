"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, Loader2, RotateCcw, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/empty-state";

export type TaskItem = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueAt: string | Date | null;
  deal?: { id: string; title: string } | null;
};
export function TaskList({
  tasks,
  compact = false,
}: {
  tasks: TaskItem[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  async function update(id: string, change: Record<string, unknown>) {
    setPending(id);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...change }),
      });
      if (!res.ok)
        throw new Error("Your change could not be saved. Please try again.");
      toast.success(
        change.status === "DONE"
          ? "Task completed"
          : change.status === "OPEN"
            ? "Task reopened"
            : "Task rescheduled",
      );
      router.refresh();
    } catch (error) {
      toast.error("Couldn't update task", (error as Error).message);
    } finally {
      setPending(null);
    }
  }
  if (!tasks.length)
    return (
      <EmptyState
        icon={Check}
        title="You’re all caught up"
        description="Keep track of follow-ups, next steps, and personal reminders."
      >
        <Button onClick={() => document.querySelector<HTMLInputElement>('input[name="title"]')?.focus()}>
          Add task
        </Button>
      </EmptyState>
    );
  return (
    <div className="divide-y divide-border" aria-label="Task list">
      {tasks.map((task) => {
        const done = task.status === "DONE";
        const overdue =
          !done && task.dueAt && new Date(task.dueAt).getTime() < Date.now();
        return (
          <div key={task.id} className="flex items-start gap-3 py-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              disabled={pending !== null}
              aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`}
              onClick={() =>
                update(task.id, { status: done ? "OPEN" : "DONE" })
              }
            >
              {pending === task.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : done ? (
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Circle className="h-5 w-5 text-primary" />
              )}
            </Button>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "break-words text-sm font-medium",
                  done && "line-through text-muted-foreground",
                )}
              >
                {task.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {task.deal ? (
                  <Link
                    className="hover:text-primary hover:underline"
                    href={`/deals/${task.deal.id}`}
                  >
                    {task.deal.title}
                  </Link>
                ) : (
                  <span>Personal task</span>
                )}
                <span className={cn(overdue && "text-destructive")}>
                  {overdue ? "Overdue · " : ""}
                  {task.dueAt ? formatDate(task.dueAt) : "No due date"}
                </span>
                {task.priority === "HIGH" || task.priority === "URGENT" ? (
                  <span className="text-amber-600">
                    {task.priority.toLowerCase()} priority
                  </span>
                ) : null}
              </div>
            </div>
            {!compact && !done && (
              <label
                className="relative shrink-0 rounded-md border p-2 text-muted-foreground hover:bg-muted"
                title="Reschedule task"
              >
                <CalendarClock className="h-4 w-4" />
                <input
                  aria-label={`Reschedule ${task.title}`}
                  type="date"
                  className="absolute inset-0 w-full cursor-pointer opacity-0"
                  disabled={pending !== null}
                  onChange={(e) => {
                    if (e.target.value)
                      void update(task.id, {
                        dueAt: new Date(
                          `${e.target.value}T17:00:00`,
                        ).toISOString(),
                      });
                  }}
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
