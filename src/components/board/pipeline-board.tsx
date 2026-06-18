"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, GripVertical, Wallet } from "lucide-react";
import { ScoreBadge } from "@/components/shared/score-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { OPPORTUNITY_STATUSES } from "@/lib/types";
import type { OpportunityStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/display";
import { cn, formatBudget } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { OpportunityListItem } from "@/lib/opportunities";

// Columns follow the natural pipeline order from lib/types.
const COLUMNS: OpportunityStatus[] = OPPORTUNITY_STATUSES;

export function PipelineBoard({ initial }: { initial: OpportunityListItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overStatus, setOverStatus] = React.useState<OpportunityStatus | null>(null);

  // Re-sync when the server sends a fresh list (e.g. after navigating back).
  React.useEffect(() => {
    setItems(initial);
  }, [initial]);

  const byStatus = React.useMemo(() => {
    const map = new Map<OpportunityStatus, OpportunityListItem[]>();
    for (const s of COLUMNS) map.set(s, []);
    for (const o of items) map.get(o.status as OpportunityStatus)?.push(o);
    return map;
  }, [items]);

  async function moveTo(status: OpportunityStatus) {
    const id = draggingId;
    setDraggingId(null);
    setOverStatus(null);
    if (!id) return;
    const card = items.find((o) => o.id === id);
    if (!card || card.status === status) return;

    const previous = card.status;
    // Optimistic move.
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success("Status updated", `${card.title.slice(0, 40)} → ${STATUS_META[status].label}`);
      router.refresh();
    } catch {
      setItems((prev) => prev.map((o) => (o.id === id ? { ...o, status: previous } : o)));
      toast.error("Couldn't move card", "Status change failed — reverted.");
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
      {COLUMNS.map((status) => {
        const cards = byStatus.get(status) ?? [];
        const meta = STATUS_META[status];
        const isOver = overStatus === status;
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              if (overStatus !== status) setOverStatus(status);
            }}
            onDragLeave={(e) => {
              // Only clear when leaving the column entirely (not entering a child).
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverStatus((s) => (s === status ? null : s));
              }
            }}
            onDrop={() => moveTo(status)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border bg-surface/40 transition-colors",
              isOver ? "border-primary/60 bg-primary/5" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                <span className="text-sm font-medium">{meta.label}</span>
              </div>
              <span className="tnum rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                {cards.length}
              </span>
            </div>

            <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {cards.length === 0 ? (
                <div
                  className={cn(
                    "flex flex-1 items-center justify-center rounded-lg border border-dashed py-8 text-xs",
                    isOver ? "border-primary/50 text-primary" : "border-border/60 text-muted-foreground",
                  )}
                >
                  {isOver ? "Drop here" : "No leads"}
                </div>
              ) : (
                cards.map((o) => (
                  <article
                    key={o.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(o.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", o.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStatus(null);
                    }}
                    className={cn(
                      "group cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-all active:cursor-grabbing hover:border-primary/40",
                      draggingId === o.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/opportunities/${o.id}`}
                          draggable={false}
                          className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary hover:underline"
                        >
                          {o.title}
                        </Link>
                        {o.organization && (
                          <div className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{o.organization}</span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="tnum flex items-center gap-1 text-xs text-muted-foreground">
                            <Wallet className="h-3 w-3" />
                            {formatBudget(o.budgetMin, o.budgetMax, o.currency ?? "DKK")}
                          </span>
                          <ScoreBadge score={o.matchScore} size="sm" />
                        </div>
                        <div className="mt-2">
                          <DeadlinePill deadline={o.deadline} />
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
