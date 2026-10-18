"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import {
  DEAL_STATUSES,
  type DealStatus,
  type TouchpointKind,
} from "@/lib/types";
import { cn, getQuickDate } from "@/lib/utils";

const LIFECYCLE_STAGES: DealStatus[] = [
  "DISCOVERED",
  "QUALIFYING",
  "INTERESTING",
  "CONTACTED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
];

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.error === "string" ? data.error : "Request failed";
    throw new Error(message);
  }
  return data;
}

export function DealActions({
  dealId,
  accountId,
  status,
}: {
  dealId: string;
  accountId: string | null;
  status: DealStatus;
}) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(status);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDue, setTaskDue] = React.useState("");
  const [taskPriority, setTaskPriority] = React.useState("MEDIUM");
  const [personName, setPersonName] = React.useState("");
  const [personEmail, setPersonEmail] = React.useState("");
  const [touchKind, setTouchKind] = React.useState<TouchpointKind>("NOTE");
  const [touchSummary, setTouchSummary] = React.useState("");

  React.useEffect(() => setCurrent(status), [status]);

  async function changeStatus(next: DealStatus) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setBusy("status");
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success("Status updated", DEAL_STATUS_META[next].label);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("leader:counts-refresh"));
      }
      router.refresh();
    } catch (err) {
      setCurrent(previous);
      toast.error(
        "Couldn't update status",
        err instanceof Error ? err.message : "Try again",
      );
    } finally {
      setBusy(null);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setBusy("task");
    try {
      await postJson("/api/tasks", {
        dealId,
        accountId: accountId ?? undefined,
        title: taskTitle.trim(),
        priority: taskPriority,
        dueAt: taskDue
          ? new Date(`${taskDue}T17:00:00`).toISOString()
          : undefined,
      });
      setTaskTitle("");
      setTaskDue("");
      setTaskPriority("MEDIUM");
      toast.success("Task added");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("leader:counts-refresh"));
      }
      router.refresh();
    } catch (err) {
      toast.error(
        "Couldn't add task",
        err instanceof Error ? err.message : "Try again",
      );
    } finally {
      setBusy(null);
    }
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!personName.trim() && !personEmail.trim()) return;
    setBusy("person");
    try {
      await postJson("/api/people", {
        dealId,
        accountId: accountId ?? undefined,
        name: personName.trim() || undefined,
        email: personEmail.trim() || undefined,
      });
      setPersonName("");
      setPersonEmail("");
      toast.success("Person added");
      router.refresh();
    } catch (err) {
      toast.error(
        "Couldn't add person",
        err instanceof Error ? err.message : "Try again",
      );
    } finally {
      setBusy(null);
    }
  }

  async function addTouchpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!touchSummary.trim()) return;
    setBusy("touch");
    try {
      await postJson("/api/touchpoints", {
        dealId,
        accountId: accountId ?? undefined,
        kind: touchKind,
        summary: touchSummary.trim(),
      });
      setTouchSummary("");
      toast.success("Touchpoint logged");
      router.refresh();
    } catch (err) {
      toast.error(
        "Couldn't log touchpoint",
        err instanceof Error ? err.message : "Try again",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Status & Stage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Interactive deal stage stepper */}
          <nav aria-label="Deal lifecycle stages" className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {LIFECYCLE_STAGES.map((stage, idx) => {
                const isCurrent = current === stage;
                const isPast =
                  LIFECYCLE_STAGES.indexOf(current) > idx &&
                  current !== "LOST" &&
                  current !== "ARCHIVED";
                return (
                  <button
                    key={stage}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => changeStatus(stage)}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`Set status to ${DEAL_STATUS_META[stage].label}`}
                    className={cn(
                      "min-h-11 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors shrink-0",
                      isCurrent
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : isPast
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isCurrent
                          ? "bg-primary-foreground"
                          : DEAL_STATUS_META[stage].dot,
                      )}
                    />
                    {DEAL_STATUS_META[stage].label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Deal status combobox — preserved exactly */}
          <Select
            value={current}
            onValueChange={(value) => changeStatus(value as DealStatus)}
            disabled={busy !== null}
          >
            <SelectTrigger aria-label="Deal status" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEAL_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {DEAL_STATUS_META[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Terminal state shortcuts */}
          <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground pt-1">
            {current !== "LOST" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => changeStatus("LOST")}
                className="min-h-11 px-2 inline-flex items-center hover:text-destructive transition-colors"
              >
                Mark lost
              </button>
            )}
            {current !== "ARCHIVED" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => changeStatus("ARCHIVED")}
                className="min-h-11 px-2 inline-flex items-center hover:text-foreground transition-colors"
              >
                Archive deal
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addTask} className="space-y-2">
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              aria-label="Follow-up task title"
              placeholder="Next step"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                aria-label="Task priority"
                className="h-11 min-h-11 rounded-md border bg-background px-2 text-xs"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <Input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                aria-label="Task due date"
                className="h-11 min-h-11 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
              <span className="font-medium">Quick date:</span>
              <button
                type="button"
                onClick={() => setTaskDue(getQuickDate("today"))}
                className="min-h-11 min-w-11 px-2.5 inline-flex items-center justify-center rounded border border-border text-xs hover:bg-muted hover:text-foreground transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setTaskDue(getQuickDate("tomorrow"))}
                className="min-h-11 min-w-11 px-2.5 inline-flex items-center justify-center rounded border border-border text-xs hover:bg-muted hover:text-foreground transition-colors"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => setTaskDue(getQuickDate("next-week"))}
                className="min-h-11 min-w-11 px-2.5 inline-flex items-center justify-center rounded border border-border text-xs hover:bg-muted hover:text-foreground transition-colors"
              >
                Next week
              </button>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={busy !== null || !taskTitle.trim()}
            >
              {busy === "task" && <Loader2 className="h-4 w-4 animate-spin" />}
              Save task
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add person</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addPerson} className="space-y-2">
            <Input
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              aria-label="Contact name"
              placeholder="Name"
            />
            <Input
              type="email"
              value={personEmail}
              onChange={(e) => setPersonEmail(e.target.value)}
              aria-label="Contact email"
              placeholder="Email"
            />
            <Button
              type="submit"
              size="sm"
              disabled={
                busy !== null || (!personName.trim() && !personEmail.trim())
              }
            >
              {busy === "person" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save person
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Log activity</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addTouchpoint} className="space-y-2">
            <Select
              value={touchKind}
              onValueChange={(value) => setTouchKind(value as TouchpointKind)}
            >
              <SelectTrigger aria-label="Touchpoint kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "CALL",
                    "EMAIL",
                    "MEETING",
                    "NOTE",
                    "MESSAGE",
                    "OTHER",
                  ] as TouchpointKind[]
                ).map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {kind.charAt(0) + kind.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="sr-only" htmlFor="touch-summary">
              Summary
            </Label>
            <Textarea
              id="touch-summary"
              value={touchSummary}
              onChange={(e) => setTouchSummary(e.target.value)}
              placeholder="What happened?"
            />
            <Button
              type="submit"
              size="sm"
              disabled={busy !== null || !touchSummary.trim()}
            >
              {busy === "touch" && <Loader2 className="h-4 w-4 animate-spin" />}
              Save activity
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
