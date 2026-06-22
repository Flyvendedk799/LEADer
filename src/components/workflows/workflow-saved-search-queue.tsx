"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, PlayCircle, SearchCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { discoveryMissionHref } from "@/lib/discovery-links";
import type { SavedSearchDiscoveryPayload } from "@/lib/saved-searches";
import { formatDate } from "@/lib/utils";

export type WorkflowSavedSearchItem = {
  id: string;
  name: string;
  href: string;
  summary: string;
  createdAt: string;
  discoveryPayload: SavedSearchDiscoveryPayload | null;
};

type QueuedSearchResult = {
  searchId: string;
  missionId: string;
};

export function WorkflowSavedSearchQueue({ searches }: { searches: WorkflowSavedSearchItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(searches);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [runningAll, setRunningAll] = React.useState(false);
  const [queuedResults, setQueuedResults] = React.useState<QueuedSearchResult[]>([]);
  const [failedCount, setFailedCount] = React.useState(0);

  React.useEffect(() => {
    setItems(searches);
  }, [searches]);

  const queueableItems = React.useMemo(() => items.filter((search) => search.discoveryPayload), [items]);
  const latestQueuedResult = queuedResults.at(-1) ?? null;

  async function deleteSearch(search: WorkflowSavedSearchItem) {
    const previous = items;
    setDeletingId(search.id);
    setItems((current) => current.filter((item) => item.id !== search.id));

    try {
      const res = await fetch("/api/saved-searches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: search.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not delete saved search");
      toast.success("Saved search deleted", search.name);
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Could not delete saved search", err instanceof Error ? err.message : "Try again");
    } finally {
      setDeletingId(null);
    }
  }

  async function queueSearch(search: WorkflowSavedSearchItem) {
    if (!search.discoveryPayload) return;
    const res = await fetch("/api/discovery/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(search.discoveryPayload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.mission?.id) throw new Error(data?.error || "Could not queue discovery");
    return String(data.mission.id);
  }

  async function runSearch(search: WorkflowSavedSearchItem) {
    setRunningId(search.id);
    setQueuedResults([]);
    setFailedCount(0);
    try {
      const missionId = await queueSearch(search);
      if (!missionId) return;
      toast.success("Discovery mission queued", search.name);
      router.push(discoveryMissionHref(missionId));
      router.refresh();
    } catch (err) {
      toast.error("Could not queue discovery", err instanceof Error ? err.message : "Try again");
    } finally {
      setRunningId(null);
    }
  }

  async function runAllSearches() {
    setRunningAll(true);
    setQueuedResults([]);
    setFailedCount(0);
    const queued: QueuedSearchResult[] = [];
    let failed = 0;

    try {
      for (const search of queueableItems) {
        try {
          const missionId = await queueSearch(search);
          if (missionId) queued.push({ searchId: search.id, missionId });
        } catch {
          failed += 1;
        }
      }

      setQueuedResults(queued);
      setFailedCount(failed);
      if (queued.length && failed) {
        toast.error("Some saved searches failed", `${queued.length} queued - ${failed} failed`);
      } else if (queued.length) {
        toast.success("Saved searches queued", `${queued.length} discovery missions queued`);
      } else {
        toast.error("No saved searches queued", failed ? `${failed} failed` : "No queueable saved searches");
      }
      router.refresh();
    } finally {
      setRunningAll(false);
    }
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No saved searches.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {queuedResults.length || failedCount ? (
          <p className={failedCount ? "mr-auto text-xs text-warning" : "mr-auto text-xs text-success"}>
            {queuedResults.length} queued{failedCount ? ` - ${failedCount} failed` : ""}
            {latestQueuedResult ? (
              <>
                {" - "}
                <Link href={discoveryMissionHref(latestQueuedResult.missionId)} className="underline-offset-4 hover:underline">
                  Open latest
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={runningAll || Boolean(runningId) || Boolean(deletingId) || queueableItems.length === 0}
          onClick={runAllSearches}
        >
          {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
          Queue all
        </Button>
      </div>
      {items.map((search) => {
        const deleting = deletingId === search.id;
        const running = runningId === search.id;
        const busy = deleting || running || runningAll;
        return (
          <div
            key={search.id}
            className="grid gap-3 rounded-md border border-border bg-surface/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Link href={search.href} className="min-w-0 hover:text-primary">
              <p className="truncate text-sm font-medium">{search.name}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{search.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">Created {formatDate(search.createdAt)}</p>
            </Link>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !search.discoveryPayload}
                onClick={() => runSearch(search)}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Run
              </Button>
              <Button asChild size="icon" variant="outline" className="h-8 w-8" title="Open saved search">
                <Link href={search.href} aria-label={`Open ${search.name}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={busy}
                onClick={() => deleteSearch(search)}
                aria-label={`Delete ${search.name}`}
                title="Delete saved search"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
