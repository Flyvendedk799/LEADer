"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Target } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { ScoreBadge } from "@/components/shared/score-badge";
import { BulkActionBar } from "./bulk-action-bar";
import { cn, formatBudget } from "@/lib/utils";
import type { OpportunityFilter } from "@/lib/types";
import type { OpportunityListItem } from "@/lib/opportunities";

type SortKey = NonNullable<OpportunityFilter["sort"]>;

/** A clickable column header that drives `sort`/`order` via the URL. */
function SortHeader({
  label,
  sortKey,
  defaultOrder,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  defaultOrder: "asc" | "desc";
  align?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSort = (searchParams.get("sort") as SortKey) || "score";
  const currentOrder = (searchParams.get("order") as "asc" | "desc") || "desc";
  const active = currentSort === sortKey;

  function onClick() {
    const nextOrder = active ? (currentOrder === "asc" ? "desc" : "asc") : defaultOrder;
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sortKey);
    params.set("order", nextOrder);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-1 text-xs font-medium transition-colors hover:text-foreground",
        align === "right" && "flex-row-reverse",
        active ? "text-foreground" : "text-muted-foreground",
      )}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {active ? (
        currentOrder === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}

export function OpportunityTable({
  items,
  selectable = false,
  sortable = false,
  lists = [],
}: {
  items: OpportunityListItem[];
  selectable?: boolean;
  sortable?: boolean;
  lists?: { id: string; name: string }[];
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id)),
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No opportunities found"
        description="Adjust your filters or add a new opportunity to get started."
      />
    );
  }

  const selectedIds = [...selected];

  return (
    <div className="relative rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
            )}
            <TableHead>
              {sortable ? <SortHeader label="Title" sortKey="title" defaultOrder="asc" /> : "Title"}
            </TableHead>
            <TableHead>
              {sortable ? <SortHeader label="Budget" sortKey="budget" defaultOrder="desc" /> : "Budget"}
            </TableHead>
            <TableHead>
              {sortable ? (
                <SortHeader label="Deadline" sortKey="deadline" defaultOrder="asc" />
              ) : (
                "Deadline"
              )}
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              {sortable ? (
                <SortHeader label="Score" sortKey="score" defaultOrder="desc" align="right" />
              ) : (
                "Score"
              )}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((o) => (
            <TableRow key={o.id} data-state={selected.has(o.id) ? "selected" : undefined}>
              {selectable && (
                <TableCell>
                  <Checkbox
                    checked={selected.has(o.id)}
                    onCheckedChange={() => toggle(o.id)}
                    aria-label={`Select ${o.title}`}
                  />
                </TableCell>
              )}
              <TableCell className="max-w-md">
                <Link
                  href={`/opportunities/${o.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {o.title}
                </Link>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {o.organization || "Unknown organization"}
                  {o.source?.name ? ` · ${o.source.name}` : ""}
                </div>
              </TableCell>
              <TableCell className="tnum whitespace-nowrap text-sm">
                {formatBudget(o.budgetMin, o.budgetMax, o.currency ?? "DKK")}
              </TableCell>
              <TableCell>
                <DeadlinePill deadline={o.deadline} />
              </TableCell>
              <TableCell>
                <StatusBadge status={o.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <ScoreBadge score={o.matchScore} size="sm" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectable && selected.size > 0 && (
        <BulkActionBar ids={selectedIds} lists={lists} onClear={() => setSelected(new Set())} />
      )}
    </div>
  );
}
