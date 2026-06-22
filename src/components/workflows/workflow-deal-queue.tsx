"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, CheckCircle2, Clock3, Loader2, MoreHorizontal, Send, TimerReset } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { formatDate, relativeDeadline } from "@/lib/utils";
import type { DealStatus } from "@/lib/types";

export type WorkflowDealItem = {
  id: string;
  title: string;
  status: DealStatus;
  accountName: string | null;
  deadline: string | null;
  updatedAt: string;
  nextAction: string | null;
};

const QUICK_STATUSES: DealStatus[] = ["CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ARCHIVED"];
type DealWorkflowAction = "revive" | "prep";

function nextActionFor(action: DealWorkflowAction) {
  return action === "revive"
    ? "Follow up and confirm buyer, budget, decision process, and next step."
    : "Prepare submission package and confirm route before the deadline.";
}

export function WorkflowDealQueue({
  deals,
  mode,
}: {
  deals: WorkflowDealItem[];
  mode: "stale" | "deadline";
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(deals);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setItems(deals);
  }, [deals]);

  async function patchDeal(deal: WorkflowDealItem, patch: Partial<Pick<WorkflowDealItem, "status" | "nextAction">>, label: string) {
    const previous = items;
    setBusyId(deal.id);
    setItems((current) => {
      if (patch.status && ["WON", "LOST", "ARCHIVED"].includes(patch.status)) {
        return current.filter((item) => item.id !== deal.id);
      }
      return current.map((item) => (item.id === deal.id ? { ...item, ...patch } : item));
    });

    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Deal update failed");
      toast.success(label);
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Deal update failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function runWorkflowAction(targetDeals: WorkflowDealItem[], action: DealWorkflowAction) {
    const previous = items;
    const targetIds = new Set(targetDeals.map((deal) => deal.id));
    const bulk = targetDeals.length > 1;
    setBusyId(bulk ? `bulk:${action}` : targetDeals[0]?.id ?? `bulk:${action}`);
    setItems((current) =>
      action === "revive"
        ? current.filter((item) => !targetIds.has(item.id))
        : current.map((item) => (targetIds.has(item.id) ? { ...item, nextAction: nextActionFor(action) } : item)),
    );

    try {
      const res = await fetch("/api/deals/workflow-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetDeals.map((deal) => deal.id), action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Workflow action failed");

      const taskSummary = `${data?.tasksCreated ?? 0} tasks created${
        data?.skippedExistingTasks ? ` - ${data.skippedExistingTasks} already existed` : ""
      }`;
      toast.success(action === "revive" ? "Deals revived" : "Deadline prep queued", taskSummary);
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Workflow action failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {mode === "stale" ? "No stale open deals." : "No upcoming deadlines."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busyId)}
          onClick={() => runWorkflowAction(items, mode === "stale" ? "revive" : "prep")}
        >
          {busyId?.startsWith("bulk:") ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === "stale" ? (
            <TimerReset className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {mode === "stale" ? "Revive all" : "Prep all"}
        </Button>
      </div>
      {items.map((deal) => {
        const meta = DEAL_STATUS_META[deal.status];
        const busy = busyId === deal.id;
        const primaryLabel = mode === "stale" ? "Revive" : "Prep";
        const primaryIcon = mode === "stale" ? TimerReset : Send;
        const PrimaryIcon = primaryIcon;
        const primaryAction =
          mode === "stale"
            ? () => runWorkflowAction([deal], "revive")
            : () => runWorkflowAction([deal], "prep");

        return (
          <div key={deal.id} className="rounded-md border border-border bg-surface/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/deals/${deal.id}`} className="min-w-0 hover:text-primary">
                <p className="truncate text-sm font-medium">{deal.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {deal.accountName ?? "No account"} - {mode === "stale" ? `updated ${relativeDeadline(deal.updatedAt)}` : formatDate(deal.deadline)}
                </p>
                {deal.nextAction ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{deal.nextAction}</p> : null}
              </Link>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={Boolean(busyId)} onClick={primaryAction}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PrimaryIcon className="h-4 w-4" />}
                {primaryLabel}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={Boolean(busyId)}
                    aria-label="Change deal status"
                    title="Change deal status"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {QUICK_STATUSES.map((status) => {
                    const statusMeta = DEAL_STATUS_META[status];
                    return (
                      <DropdownMenuItem
                        key={status}
                        disabled={deal.status === status}
                        onClick={() => patchDeal(deal, { status }, `Deal marked ${statusMeta.label}`)}
                      >
                        {status === "WON" ? <CheckCircle2 className="h-4 w-4" /> : <BriefcaseBusiness className="h-4 w-4" />}
                        {statusMeta.label}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      patchDeal(
                        deal,
                        { nextAction: "Confirm the next concrete step, owner, timing, and decision route." },
                        "Next action updated",
                      )
                    }
                  >
                    <Clock3 className="h-4 w-4" />
                    Reset next action
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
