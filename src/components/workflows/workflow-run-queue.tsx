"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, ExternalLink, Loader2, PlayCircle, RotateCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
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
};

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
  };
}

export function WorkflowRunQueue({ runs }: { runs: WorkflowRunQueueItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(runs);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setItems(runs);
  }, [runs]);

  async function controlRun(run: WorkflowRunQueueItem, action: "CANCEL" | "RERUN") {
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
        setItems((current) => current.map((item) => (item.id === run.id ? { ...item, ...updated } : item)));
        toast.success("Workflow run canceled", playbookLabel(run.playbook));
      } else {
        const rerun = apiRunToItem(data.run);
        setItems((current) => [rerun, ...current]);
        toast.success("Workflow run queued", playbookLabel(run.playbook));
      }
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
      {items.map((run) => {
        const latestLog = run.log.at(-1) ?? run.summary;
        const cancelable = ["QUEUED", "RUNNING"].includes(run.status);
        const cancelBusy = busyId === `CANCEL-${run.id}`;
        const rerunBusy = busyId === `RERUN-${run.id}`;
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
              </div>
              {latestLog ? (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{truncate(latestLog, 150)}</p>
              ) : null}
            </Link>
            <div className="flex items-center justify-end gap-2">
              <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <PlayCircle className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{formatDate(run.finishedAt ?? run.startedAt ?? run.createdAt)}</span>
              </div>
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
                disabled={Boolean(busyId)}
                onClick={() => controlRun(run, "RERUN")}
                aria-label="Rerun workflow"
                title="Rerun workflow"
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
      })}
    </div>
  );
}
