"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  PlayCircle,
  RotateCw,
  Search,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { workflowRunCanRerun, workflowRunRerunBlockedMessage } from "@/lib/workflows/run-actions";
import { formatDate, truncate } from "@/lib/utils";

export type WorkflowRunQueueItem = {
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

type WorkflowRunQueueResponse = {
  runs?: Array<Partial<WorkflowRunQueueItem> & { id: string }>;
  queue?: Partial<WorkflowQueueSnapshot>;
  canceled?: number;
  error?: string;
};

type WorkflowRunAction = "CANCEL" | "CANCEL_ALL" | "RERUN" | "MOVE_UP" | "MOVE_DOWN" | "MOVE_TOP";

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

function normalizeQueue(queue?: Partial<WorkflowQueueSnapshot> | null): WorkflowQueueSnapshot {
  return {
    activeRunId: typeof queue?.activeRunId === "string" ? queue.activeRunId : null,
    queuedRunIds: Array.isArray(queue?.queuedRunIds) ? queue.queuedRunIds.filter((id): id is string => typeof id === "string") : [],
  };
}

function playbookLabel(playbook: string) {
  return playbook
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function apiRunToItem(run: Partial<WorkflowRunQueueItem> & { id: string; playbook?: string; workspace?: string; status?: string }): WorkflowRunQueueItem {
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

function triggerLabel(run: WorkflowRunQueueItem) {
  if (run.trigger === "schedule") return run.presetName ? `schedule: ${run.presetName}` : "schedule";
  if (run.trigger === "preset") return run.presetName ? `preset: ${run.presetName}` : "preset";
  if (run.trigger === "rerun") return run.presetName ? `rerun: ${run.presetName}` : "rerun";
  return "manual";
}

function sortRunsWithQueue(items: WorkflowRunQueueItem[], queue: WorkflowQueueSnapshot) {
  const queueIndex = new Map(queue.queuedRunIds.map((id, index) => [id, index]));
  const rank = (run: WorkflowRunQueueItem) => {
    if (queue.activeRunId === run.id) return -1;
    const index = queueIndex.get(run.id);
    return index == null ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...items].sort((a, b) => {
    const rankA = rank(a);
    const rankB = rank(b);
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function workflowRunSearchText(run: WorkflowRunQueueItem) {
  return [
    run.id,
    run.playbook,
    playbookLabel(run.playbook),
    run.workspace,
    run.status,
    run.trigger,
    run.presetName,
    run.summary,
    ...(run.log ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function workflowRunMatchesSearch(run: WorkflowRunQueueItem, search: string) {
  const terms = search
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return true;
  const haystack = workflowRunSearchText(run);
  return terms.every((term) => haystack.includes(term));
}

export function WorkflowRunQueue({
  runs,
  queue = { activeRunId: null, queuedRunIds: [] },
}: {
  runs: WorkflowRunQueueItem[];
  queue?: WorkflowQueueSnapshot;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(runs);
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyLimit, setHistoryLimit] = React.useState(20);
  const [queueState, setQueueState] = React.useState(() => normalizeQueue(queue));
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);
  const orderedItems = React.useMemo(() => sortRunsWithQueue(items, queueState), [items, queueState]);
  const filteredItems = React.useMemo(
    () => orderedItems.filter((run) => workflowRunMatchesSearch(run, historySearch)),
    [historySearch, orderedItems],
  );
  const historySearchActive = historySearch.trim().length > 0;
  const canLoadOlderRuns = items.length >= historyLimit && historyLimit < 100;

  React.useEffect(() => {
    setItems(runs);
  }, [runs]);

  React.useEffect(() => {
    setQueueState(normalizeQueue(queue));
  }, [queue]);

  const live = React.useMemo(
    () =>
      items.some((item) => item.status === "QUEUED" || item.status === "RUNNING") ||
      Boolean(queueState.activeRunId) ||
      queueState.queuedRunIds.length > 0,
    [items, queueState.activeRunId, queueState.queuedRunIds.length],
  );

  React.useEffect(() => {
    if (!live) return;
    let stopped = false;

    async function refreshRuns() {
      try {
        const params = new URLSearchParams({ limit: String(historyLimit) });
        const res = await fetch(`/api/workflows/run?${params.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as WorkflowRunQueueResponse | null;
        if (!res.ok || !data) return;
        if (stopped) return;
        if (Array.isArray(data.runs)) {
          setItems(data.runs.map(apiRunToItem));
        }
        setQueueState(normalizeQueue(data.queue));
        setLastUpdatedAt(new Date());
      } catch {
        // Durable runs remain visible from the server snapshot; keep polling quiet.
      }
    }

    void refreshRuns();
    const timer = window.setInterval(refreshRuns, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [historyLimit, live]);

  const loadOlderRuns = React.useCallback(async () => {
    const nextLimit = Math.min(100, historyLimit + 20);
    setHistoryLimit(nextLimit);
    try {
      const params = new URLSearchParams({ limit: String(nextLimit) });
      const res = await fetch(`/api/workflows/run?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as WorkflowRunQueueResponse | null;
      if (!res.ok || !data) throw new Error(data?.error || "Could not load workflow history");
      if (Array.isArray(data.runs)) setItems(data.runs.map(apiRunToItem));
      setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
    } catch (err) {
      toast.error("Could not load workflow history", err instanceof Error ? err.message : "Try again");
    }
  }, [historyLimit]);

  async function controlRun(run: WorkflowRunQueueItem, action: WorkflowRunAction) {
    setBusyId(`${action}-${run.id}`);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: run.id, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.run) throw new Error(data?.error || "Workflow control failed");

      if (action === "CANCEL") {
        const updated = apiRunToItem(data.run);
        if (data.queue) setQueueState(normalizeQueue(data.queue));
        setItems((current) => current.map((item) => (item.id === run.id ? { ...item, ...updated } : item)));
        toast.success("Workflow run canceled", playbookLabel(run.playbook));
      } else if (action === "RERUN") {
        const rerun = apiRunToItem(data.run);
        if (data.queue) setQueueState(normalizeQueue(data.queue));
        setItems((current) => [rerun, ...current]);
        setHistorySearch("");
        toast.success("Workflow run queued", playbookLabel(run.playbook));
      } else {
        const updated = apiRunToItem(data.run);
        if (data.queue) setQueueState(normalizeQueue(data.queue));
        setItems((current) => current.map((item) => (item.id === run.id ? { ...item, ...updated } : item)));
        toast.success("Workflow priority updated", playbookLabel(run.playbook));
      }
      router.refresh();
    } catch (err) {
      toast.error("Workflow control failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelLiveRuns() {
    setBusyId("CANCEL_ALL");
    try {
      const res = await fetch("/api/workflows/run", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL_ALL", limit: historyLimit }),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunQueueResponse | null;
      if (!res.ok || !data) throw new Error(data?.error || "Workflow control failed");

      if (Array.isArray(data.runs)) setItems(data.runs.map(apiRunToItem));
      if (data.queue) setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
      toast.success("Live workflow queue canceled", `${data.canceled ?? 0} playbook runs stopped`);
      router.refresh();
    } catch (err) {
      toast.error("Workflow control failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No playbook runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        {live ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Live queue
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={cancelLiveRuns}
            >
              {busyId === "CANCEL_ALL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancel live
            </Button>
          </div>
        ) : lastUpdatedAt ? (
          <span>Updated {formatDate(lastUpdatedAt.toISOString())}</span>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Find old playbook run"
            className="pr-9 pl-8"
          />
          {historySearchActive ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => setHistorySearch("")}
              aria-label="Clear playbook run search"
              title="Clear"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {historySearchActive
            ? `${filteredItems.length} of ${orderedItems.length} loaded playbook runs match`
            : `${orderedItems.length} playbook runs loaded`}
        </p>
      </div>
      {filteredItems.length ? (
        filteredItems.map((run) => {
          const latestLog = run.log.at(-1) ?? null;
          const visibleLatestLog = latestLog && latestLog !== run.summary ? latestLog : null;
          const cancelable = ["QUEUED", "RUNNING"].includes(run.status);
          const rerunnable = workflowRunCanRerun(run.status);
          const rerunBlockedMessage = workflowRunRerunBlockedMessage(run.status);
          const cancelBusy = busyId === `CANCEL-${run.id}`;
          const rerunBusy = busyId === `RERUN-${run.id}`;
          const queuedIndex = queueState.queuedRunIds.indexOf(run.id);
          const moveable = run.status === "QUEUED" && queuedIndex >= 0;
          const lastQueuedIndex = queueState.queuedRunIds.length - 1;
          const queueLabel =
            queueState.activeRunId === run.id ? "active" : queuedIndex >= 0 ? `queued #${queuedIndex + 1}` : null;
          return (
            <div
              key={run.id}
              className="grid gap-3 rounded-md border border-border bg-surface/40 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Link href={`/workflows/runs/${run.id}`} className="min-w-0 hover:text-primary">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusIcon status={run.status} />
                  <p className="truncate text-sm font-medium">{playbookLabel(run.playbook)}</p>
                  <Badge variant={statusVariant(run.status)}>{run.status.toLowerCase()}</Badge>
                  <Badge variant="outline">{run.workspace}</Badge>
                  <Badge variant={run.trigger === "manual" ? "outline" : "secondary"}>{triggerLabel(run)}</Badge>
                  {queueLabel ? <Badge variant="secondary">{queueLabel}</Badge> : null}
                </div>
                {run.summary ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{truncate(run.summary, 150)}</p>
                ) : null}
                {visibleLatestLog ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {truncate(visibleLatestLog, 150)}
                  </p>
                ) : null}
              </Link>
              <div className="flex items-center justify-end gap-2">
                <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{formatDate(run.finishedAt ?? run.startedAt ?? run.createdAt)}</span>
                </div>
                {moveable ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={Boolean(busyId) || queuedIndex === 0}
                      onClick={() => controlRun(run, "MOVE_TOP")}
                      aria-label="Move workflow to top"
                      title="Move workflow to top"
                    >
                      {busyId === `MOVE_TOP-${run.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUpToLine className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={Boolean(busyId) || queuedIndex === 0}
                      onClick={() => controlRun(run, "MOVE_UP")}
                      aria-label="Move workflow up"
                      title="Move workflow up"
                    >
                      {busyId === `MOVE_UP-${run.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={Boolean(busyId) || queuedIndex === lastQueuedIndex}
                      onClick={() => controlRun(run, "MOVE_DOWN")}
                      aria-label="Move workflow down"
                      title="Move workflow down"
                    >
                      {busyId === `MOVE_DOWN-${run.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                ) : null}
                <Button
                  asChild
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  aria-label="Inspect workflow"
                  title="Inspect workflow"
                >
                  <Link href={`/workflows/runs/${run.id}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={Boolean(busyId) || !rerunnable}
                  onClick={() => controlRun(run, "RERUN")}
                  aria-label={rerunBlockedMessage ?? "Rerun workflow"}
                  title={rerunBlockedMessage ?? "Rerun workflow"}
                >
                  {rerunBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                </Button>
                {cancelable ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={Boolean(busyId)}
                    onClick={() => controlRun(run, "CANCEL")}
                    aria-label="Cancel workflow"
                    title="Cancel workflow"
                  >
                    {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })
      ) : (
        <p className="py-3 text-center text-sm text-muted-foreground">
          {historySearchActive ? "No loaded playbook runs match this search." : "No playbook runs yet."}
        </p>
      )}
      {canLoadOlderRuns ? (
        <Button type="button" variant="outline" size="sm" className="w-full" disabled={Boolean(busyId)} onClick={loadOlderRuns}>
          <History className="h-4 w-4" />
          Load older playbook runs
        </Button>
      ) : null}
    </div>
  );
}
