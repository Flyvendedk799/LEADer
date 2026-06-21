"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, Play, ShieldOff, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { SOURCE_TYPE_META } from "@/lib/display";
import { formatDate, relativeDeadline } from "@/lib/utils";
import type { MonitorFrequency, SourceType, Workspace } from "@/lib/types";

export type WorkflowSourceItem = {
  id: string;
  name: string;
  url: string | null;
  type: SourceType;
  workspace: Workspace;
  frequency: MonitorFrequency;
  enabled: boolean;
  lastCheckedAt: string | null;
};

type RunResult = {
  status: string;
  found: number;
  created: number;
  updated: number;
  error?: string;
};

export function WorkflowSourceQueue({ sources }: { sources: WorkflowSourceItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(sources);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [disablingId, setDisablingId] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, RunResult>>({});

  React.useEffect(() => {
    setItems(sources);
  }, [sources]);

  async function runSource(source: WorkflowSourceItem) {
    const meta = SOURCE_TYPE_META[source.type];
    if (!meta.automatable) return;
    setRunningId(source.id);
    try {
      const res = await fetch("/api/cron/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const data = (await res.json().catch(() => null)) as { results?: RunResult[]; error?: string } | null;
      const result = data?.results?.[0];
      if (!res.ok || !result) throw new Error(result?.error || data?.error || "Source run failed");
      setResults((current) => ({ ...current, [source.id]: result }));
      if (result.status === "ERROR") {
        toast.error("Source run failed", result.error || "The run did not complete.");
      } else if (result.status === "SKIPPED") {
        toast.success("Source skipped", result.error || "This source is not automatable.");
      } else {
        toast.success(
          `Ran ${source.name}`,
          `Found ${result.found} - ${result.created} new - ${result.updated} updated`,
        );
      }
      router.refresh();
    } catch (err) {
      setResults((current) => ({
        ...current,
        [source.id]: { status: "ERROR", found: 0, created: 0, updated: 0, error: err instanceof Error ? err.message : "Run failed" },
      }));
      toast.error("Source run failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setRunningId(null);
    }
  }

  async function disableSource(source: WorkflowSourceItem) {
    const previous = items;
    setDisablingId(source.id);
    setItems((current) => current.filter((item) => item.id !== source.id));
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not disable source");
      toast.success("Source disabled", source.name);
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Could not disable source", err instanceof Error ? err.message : "Try again");
    } finally {
      setDisablingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No active sources.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((source) => {
        const meta = SOURCE_TYPE_META[source.type];
        const running = runningId === source.id;
        const disabling = disablingId === source.id;
        const result = results[source.id];
        return (
          <div key={source.id} className="rounded-md border border-border bg-surface/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <Link href="/sources" className="min-w-0 hover:text-primary">
                <p className="truncate text-sm font-medium">{source.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.lastCheckedAt ? `checked ${relativeDeadline(source.lastCheckedAt)}` : "Never checked"} - {source.frequency.toLowerCase()}
                </p>
                {source.url ? (
                  <span className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{source.url}</span>
                  </span>
                ) : null}
              </Link>
              <Badge variant={meta.automatable ? "secondary" : "muted"} className="shrink-0 gap-1">
                {meta.automatable ? <CheckCircle2 className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                {meta.label}
              </Badge>
            </div>

            {result ? (
              <p className={result.status === "SUCCESS" ? "mt-2 text-xs text-success" : "mt-2 text-xs text-warning"}>
                {result.status === "SUCCESS"
                  ? `Found ${result.found} - ${result.created} new - ${result.updated} updated`
                  : `${result.status}${result.error ? `: ${result.error}` : ""}`}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Last checked: {formatDate(source.lastCheckedAt)}</p>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!meta.automatable || running || disabling}
                onClick={() => runSource(source)}
                title={meta.automatable ? "Run source now" : "Manual-only sources cannot be run automatically"}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={running || disabling}
                onClick={() => disableSource(source)}
              >
                {disabling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Disable
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
