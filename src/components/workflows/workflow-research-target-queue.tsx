"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, CheckCircle2, ExternalLink, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { researchBriefRunPayload } from "@/lib/workflows/usecase-actions";

type Workspace = "DK" | "GLOBAL";

export type WorkflowResearchTargetItem = {
  id: string;
  accountId: string;
  name: string;
  workspace: Workspace;
  type: string;
  peopleCount: number;
  reachablePeopleCount: number;
  openDealCount: number;
  latestDealId: string | null;
  latestDealTitle: string | null;
  reason: string;
};

type WorkflowRunResponse = {
  run?: {
    id: string;
    status: string;
  };
  error?: unknown;
};

export function WorkflowResearchTargetQueue({
  targets,
}: {
  targets: WorkflowResearchTargetItem[];
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [queuedRuns, setQueuedRuns] = React.useState<Record<string, string>>({});

  async function queueTarget(target: WorkflowResearchTargetItem) {
    setBusyId(target.id);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          researchBriefRunPayload({
            subject: target.name,
            subjectType: "company",
            objective: "find-contact",
            depth: "standard",
            createTasks: true,
            workspace: target.workspace,
            accountId: target.accountId,
            dealId: target.latestDealId,
          }),
        ),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) throw new Error(String(data?.error || "Could not queue research brief"));
      setQueuedRuns((current) => ({ ...current, [target.id]: data.run!.id }));
      toast.success("Research brief queued", `${target.name} will run in the workflow queue.`);
    } catch (err) {
      toast.error("Could not queue research brief", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  if (targets.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No open contact gaps right now.</p>;
  }

  return (
    <div className="space-y-2">
      {targets.map((target) => {
        const busy = busyId === target.id;
        const queuedRunId = queuedRuns[target.id];
        return (
          <div key={target.id} className="rounded-md border border-border bg-surface/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/accounts/${target.accountId}`} className="min-w-0 hover:text-primary">
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-primary" />
                  <p className="truncate text-sm font-medium">{target.name}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {target.openDealCount} open {target.openDealCount === 1 ? "deal" : "deals"} - {target.peopleCount} saved {target.peopleCount === 1 ? "person" : "people"}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{target.reason}</p>
              </Link>
              <Badge variant={target.workspace === "DK" ? "secondary" : "outline"}>{target.workspace === "DK" ? "DK" : "Global"}</Badge>
            </div>

            {target.latestDealTitle ? (
              <Link
                href={target.latestDealId ? `/deals/${target.latestDealId}` : `/accounts/${target.accountId}`}
                className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{target.latestDealTitle}</span>
              </Link>
            ) : null}

            <div className="mt-3 flex items-center justify-end gap-2">
              {queuedRunId ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={`/workflows/runs/${queuedRunId}`}>
                    <CheckCircle2 className="h-4 w-4" />
                    Open run
                  </Link>
                </Button>
              ) : (
                <Button type="button" size="sm" disabled={busy} onClick={() => queueTarget(target)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Queue brief
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
