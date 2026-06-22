"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, CheckCircle2, CopyX, ExternalLink, Loader2, MoreHorizontal, XCircle } from "lucide-react";

import { ScoreBadge } from "@/components/shared/score-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { discoveryCandidateHref } from "@/lib/discovery-links";
import { truncate } from "@/lib/utils";

export type WorkflowCandidateItem = {
  id: string;
  title: string;
  missionId: string | null;
  laneName: string | null;
  organization: string | null;
  sourceName: string | null;
  evidenceSnippet: string | null;
  pursuitScore: number | null;
};

type CandidateAction = "review" | "save" | "dismiss" | "duplicate";

export function WorkflowCandidateQueue({ candidates }: { candidates: WorkflowCandidateItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(candidates);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setItems(candidates);
  }, [candidates]);

  async function act(candidate: WorkflowCandidateItem, action: CandidateAction) {
    const previous = items;
    setBusyId(candidate.id);
    setItems((current) => current.filter((item) => item.id !== candidate.id));

    try {
      const res = await fetch(`/api/discovery/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "dismiss" ? "Not a fit right now" : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Candidate update failed");

      if (action === "save") {
        toast.success(data?.created ? "Saved as deal" : "Deal already exists");
      } else if (action === "review") {
        toast.success("Candidate reviewed");
      } else if (action === "duplicate") {
        toast.success("Candidate marked duplicate");
      } else {
        toast.success("Candidate dismissed");
      }
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Candidate update failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkAct(action: Extract<CandidateAction, "review" | "save">) {
    const previous = items;
    const ids = items.map((candidate) => candidate.id);
    setBusyId(`bulk:${action}`);
    setItems([]);

    try {
      const res = await fetch("/api/discovery/candidates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Candidate update failed");

      if (action === "save") {
        const created = Number(data?.created ?? 0);
        const existing = Number(data?.existing ?? 0);
        toast.success("Candidates saved", `${created} new deals${existing ? ` - ${existing} existing` : ""}`);
      } else {
        toast.success("Candidates reviewed", `${data?.count ?? ids.length} candidates cleared`);
      }
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Candidate update failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No hot candidates waiting.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busyId)}
          onClick={() => bulkAct("review")}
        >
          {busyId === "bulk:review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          Review all
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={Boolean(busyId)}
          onClick={() => bulkAct("save")}
        >
          {busyId === "bulk:save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Save all
        </Button>
      </div>
      {items.map((candidate) => {
        const busy = busyId === candidate.id;
        const href = discoveryCandidateHref(candidate.missionId, candidate.id);
        return (
          <div
            key={candidate.id}
            className="grid gap-3 rounded-md border border-border bg-surface/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Link href={href} className="min-w-0 hover:text-primary">
              <p className="truncate text-sm font-medium">{candidate.title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {candidate.laneName ?? "Discovery"} - {candidate.organization ?? candidate.sourceName ?? "Unknown source"}
              </p>
              {candidate.evidenceSnippet ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {truncate(candidate.evidenceSnippet, 180)}
                </p>
              ) : null}
            </Link>

            <div className="flex items-center justify-end gap-2">
              <ScoreBadge score={candidate.pursuitScore} size="sm" />
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => act(candidate, "save")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={busy}
                    aria-label="More candidate actions"
                    title="More candidate actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => act(candidate, "review")}>
                    <CheckCircle2 className="h-4 w-4" />
                    Reviewed
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={href}>
                      <ExternalLink className="h-4 w-4" />
                      Open run
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => act(candidate, "duplicate")}>
                    <CopyX className="h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => act(candidate, "dismiss")}>
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
