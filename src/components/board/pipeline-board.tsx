"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, GripVertical, Wallet } from "lucide-react";
import { ScoreBadge } from "@/components/shared/score-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { DEAL_STATUSES } from "@/lib/types";
import type { DealStatus } from "@/lib/types";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { cn, formatBudget } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export type BoardDeal = {
  id: string;
  title: string;
  status: DealStatus;
  valueMin: number | null;
  valueMax: number | null;
  currency: string | null;
  deadline: Date | string | null;
  pursuitScore: number | null;
  account: { name: string } | null;
};

const COLUMNS: DealStatus[] = DEAL_STATUSES;

export function PipelineBoard({ initial }: { initial: BoardDeal[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overStatus, setOverStatus] = React.useState<DealStatus | null>(null);

  React.useEffect(() => {
    setItems(initial);
  }, [initial]);

  const byStatus = React.useMemo(() => {
    const map = new Map<DealStatus, BoardDeal[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const deal of items) map.get(deal.status)?.push(deal);
    return map;
  }, [items]);

  async function moveTo(status: DealStatus, selectedId?: string) {
    const id = selectedId ?? draggingId;
    if (pendingId) return;
    setDraggingId(null);
    setOverStatus(null);
    if (!id) return;
    const card = items.find((deal) => deal.id === id);
    if (!card || card.status === status) return;

    setPendingId(id);
    const previous = card.status;
    setItems((prev) =>
      prev.map((deal) => (deal.id === id ? { ...deal, status } : deal)),
    );
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success(
        "Status updated",
        `${card.title.slice(0, 40)} → ${DEAL_STATUS_META[status].label}`,
      );
      router.refresh();
    } catch {
      setItems((prev) =>
        prev.map((deal) =>
          deal.id === id ? { ...deal, status: previous } : deal,
        ),
      );
      toast.error("Couldn't move card", "Status change failed — reverted.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
      {COLUMNS.map((status) => {
        const cards = byStatus.get(status) ?? [];
        const meta = DEAL_STATUS_META[status];
        const isOver = overStatus === status;
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              if (overStatus !== status) setOverStatus(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverStatus((current) =>
                  current === status ? null : current,
                );
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
                    isOver
                      ? "border-primary/50 text-primary"
                      : "border-border/60 text-muted-foreground",
                  )}
                >
                  {isOver ? "Drop here" : "No deals"}
                </div>
              ) : (
                cards.map((deal) => (
                  <article
                    key={deal.id}
                    draggable={!pendingId}
                    onDragStart={(e) => {
                      setDraggingId(deal.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", deal.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStatus(null);
                    }}
                    className={cn(
                      "group cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-all active:cursor-grabbing hover:border-primary/40",
                      draggingId === deal.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/deals/${deal.id}`}
                          draggable={false}
                          className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary hover:underline"
                        >
                          {deal.title}
                        </Link>
                        {deal.account && (
                          <div className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {deal.account.name}
                            </span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="tnum flex items-center gap-1 text-xs text-muted-foreground">
                            <Wallet className="h-3 w-3" />
                            {formatBudget(
                              deal.valueMin,
                              deal.valueMax,
                              deal.currency ?? "DKK",
                            )}
                          </span>
                          <ScoreBadge score={deal.pursuitScore} size="sm" />
                        </div>
                        <div className="mt-2">
                          <DeadlinePill deadline={deal.deadline} />
                          <select
                            aria-label={`Stage for ${deal.title}`}
                            value={deal.status}
                            disabled={pendingId !== null}
                            onChange={(e) =>
                              void moveTo(e.target.value as DealStatus, deal.id)
                            }
                            className="mt-3 h-8 w-full rounded-md border bg-background px-2 text-xs"
                          >
                            {COLUMNS.map((stage) => (
                              <option key={stage} value={stage}>
                                {DEAL_STATUS_META[stage].label}
                              </option>
                            ))}
                          </select>
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
