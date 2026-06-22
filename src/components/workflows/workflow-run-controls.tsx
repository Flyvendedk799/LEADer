"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { formatDate, truncate } from "@/lib/utils";
import { CheckCircle2, Clock3, Loader2, PlayCircle, RotateCw, XCircle } from "lucide-react";

type WorkflowRunControlItem = {
  id: string;
  playbook: string;
  workspace: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  log: string[];
  summary: string | null;
  trigger: string;
  presetId: string | null;
  presetName: string | null;
};

type WorkflowQueueSnapshot = {
  activeRunId: string | null;
  queuedRunIds: string[];
};

type WorkflowRunResponse = {
  runs?: Array<Partial<WorkflowRunControlItem> & { id: string }>;
  run?: Partial<WorkflowRunControlItem> & { id: string };
  queue?: Partial<WorkflowQueueSnapshot>;
  error?: unknown;
};

function normalizeQueue(queue?: Partial<WorkflowQueueSnapshot> | null): WorkflowQueueSnapshot {
  return {
    activeRunId: typeof queue?.activeRunId === "string" ? queue.activeRunId : null,
    queuedRunIds: Array.isArray(queue?.queuedRunIds)
      ? queue.queuedRunIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeRun(run: Partial<WorkflowRunControlItem> & { id: string }): WorkflowRunControlItem {
  return {
    id: run.id,
    playbook: String(run.playbook ?? "daily-sweep"),
    workspace: String(run.workspace ?? "DK"),
    status: String(run.status ?? "QUEUED"),
    createdAt: run.createdAt ? new Date(run.createdAt).toISOString() : new Date().toISOString(),
    startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
    finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    log: Array.isArray(run.log) ? run.log.map(String) : [],
    summary: typeof run.summary === "string" ? run.summary : null,
    trigger: typeof run.trigger === "string" ? run.trigger : "manual",
    presetId: typeof run.presetId === "string" ? run.presetId : null,
    presetName: typeof run.presetName === "string" ? run.presetName : null,
  };
}

function statusVariant(status: string) {
  if (status === "SUCCESS") return "success";
  if (status === "ERROR") return "warning";
  if (status === "CANCELED") return "muted";
  if (status === "RUNNING" || status === "QUEUED") return "secondary";
  return "outline";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "ERROR") return <XCircle className="h-4 w-4 text-warning" />;
  if (status === "RUNNING") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "CANCELED") return <XCircle className="h-4 w-4 text-muted-foreground" />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" />;
}

function playbookLabel(playbook: string) {
  return playbook
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function triggerLabel(run: WorkflowRunControlItem) {
  if (run.trigger === "schedule") return run.presetName ? `schedule: ${run.presetName}` : "schedule";
  if (run.trigger === "preset") return run.presetName ? `preset: ${run.presetName}` : "preset";
  if (run.trigger === "rerun") return run.presetName ? `rerun: ${run.presetName}` : "rerun";
  return "manual";
}

export function WorkflowRunControls({
  run,
  queue,
}: {
  run: WorkflowRunControlItem;
  queue: WorkflowQueueSnapshot;
}) {
  const router = useRouter();
  const [item, setItem] = React.useState(run);
  const [queueState, setQueueState] = React.useState(() => normalizeQueue(queue));
  const [busyAction, setBusyAction] = React.useState<"CANCEL" | "RERUN" | null>(null);
  const refreshedTerminal = React.useRef(false);

  React.useEffect(() => {
    setItem(run);
  }, [run]);

  React.useEffect(() => {
    setQueueState(normalizeQueue(queue));
  }, [queue]);

  const live =
    item.status === "QUEUED" ||
    item.status === "RUNNING" ||
    queueState.activeRunId === item.id ||
    queueState.queuedRunIds.includes(item.id);

  React.useEffect(() => {
    if (!live) return;
    let stopped = false;

    async function refreshRun() {
      try {
        const res = await fetch("/api/workflows/run", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
        if (!res.ok || !data || stopped) return;
        const next = data.runs?.find((candidate) => candidate.id === item.id);
        if (next) {
          const normalized = normalizeRun(next);
          setItem(normalized);
          if (!["QUEUED", "RUNNING"].includes(normalized.status) && !refreshedTerminal.current) {
            refreshedTerminal.current = true;
            router.refresh();
          }
        }
        setQueueState(normalizeQueue(data.queue));
      } catch {
        // The durable run remains visible from the server snapshot.
      }
    }

    void refreshRun();
    const timer = window.setInterval(refreshRun, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [item.id, live, router]);

  async function controlRun(action: "CANCEL" | "RERUN") {
    setBusyAction(action);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action }),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) {
        throw new Error(String(data?.error || "Workflow control failed"));
      }
      setQueueState(normalizeQueue(data.queue));

      if (action === "RERUN") {
        const next = normalizeRun(data.run);
        toast.success("Workflow run queued", playbookLabel(item.playbook));
        router.push(`/workflows/runs/${next.id}`);
      } else {
        setItem(normalizeRun(data.run));
        toast.success("Workflow run canceled", playbookLabel(item.playbook));
        router.refresh();
      }
    } catch (err) {
      toast.error("Workflow control failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyAction(null);
    }
  }

  const latestLog = item.log.at(-1) ?? item.summary;
  const queuedIndex = queueState.queuedRunIds.indexOf(item.id);
  const queueLabel = queueState.activeRunId === item.id ? "active" : queuedIndex >= 0 ? `queued #${queuedIndex + 1}` : null;
  const cancelable = item.status === "QUEUED" || item.status === "RUNNING";

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon status={item.status} />
            <p className="truncate text-sm font-medium">{playbookLabel(item.playbook)}</p>
            <Badge variant={statusVariant(item.status)}>{item.status.toLowerCase()}</Badge>
            <Badge variant="outline">{item.workspace}</Badge>
            <Badge variant={item.trigger === "manual" ? "outline" : "secondary"}>{triggerLabel(item)}</Badge>
            {queueLabel ? <Badge variant="secondary">{queueLabel}</Badge> : null}
            {live ? <Badge variant="secondary">live</Badge> : null}
          </div>
          {latestLog ? (
            <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{truncate(latestLog, 180)}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <PlayCircle className="h-3.5 w-3.5" />
              {formatDate(item.finishedAt ?? item.startedAt ?? item.createdAt)}
            </span>
            {item.summary ? <span>{item.summary}</span> : null}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(busyAction)}
            onClick={() => controlRun("RERUN")}
          >
            {busyAction === "RERUN" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            Rerun
          </Button>
          {cancelable ? (
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={() => controlRun("CANCEL")}
            >
              {busyAction === "CANCEL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
