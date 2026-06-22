import { CheckCircle2, Clock3, Loader2, PlayCircle, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  if (status === "RUNNING" || status === "QUEUED") return "secondary";
  return "outline";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "ERROR") return <XCircle className="h-4 w-4 text-warning" />;
  if (status === "RUNNING") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" />;
}

function playbookLabel(playbook: string) {
  return playbook
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function WorkflowRunQueue({ runs }: { runs: WorkflowRunQueueItem[] }) {
  if (runs.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No playbook runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const latestLog = run.log.at(-1) ?? run.summary;
        return (
          <div
            key={run.id}
            className="grid gap-2 rounded-md border border-border bg-surface/40 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusIcon status={run.status} />
                <p className="truncate text-sm font-medium">{playbookLabel(run.playbook)}</p>
                <Badge variant={statusVariant(run.status)}>{run.status.toLowerCase()}</Badge>
                <Badge variant="outline">{run.workspace}</Badge>
              </div>
              {latestLog ? (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{truncate(latestLog, 150)}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground md:justify-end">
              <PlayCircle className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">{formatDate(run.finishedAt ?? run.startedAt ?? run.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
