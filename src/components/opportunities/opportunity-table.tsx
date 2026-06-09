"use client";

import * as React from "react";
import Link from "next/link";
import { Target, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { ScoreBadge } from "@/components/shared/score-badge";
import { ExportDialog } from "./export-dialog";
import { formatBudget } from "@/lib/utils";
import type { OpportunityListItem } from "@/lib/opportunities";

export function OpportunityTable({
  items,
  selectable = false,
}: {
  items: OpportunityListItem[];
  selectable?: boolean;
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
            <TableHead>Title</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Score</TableHead>
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
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-surface-2/95 px-4 py-3 backdrop-blur">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <ExportDialog ids={selectedIds} />
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
