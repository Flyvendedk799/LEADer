"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ListPlus, Loader2, Star, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExportDialog } from "./export-dialog";
import { OPPORTUNITY_STATUSES } from "@/lib/types";
import type { OpportunityStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/display";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type BulkBody =
  | { action: "setStatus"; status: OpportunityStatus }
  | { action: "setPriority"; priority: number }
  | { action: "addToWatchlist" }
  | { action: "removeFromWatchlist" }
  | { action: "addToList"; listId: string }
  | { action: "delete" };

export function BulkActionBar({
  ids,
  lists,
  onClear,
}: {
  ids: string[];
  lists: { id: string; name: string }[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const count = ids.length;
  const noun = count === 1 ? "opportunity" : "opportunities";

  async function run(body: BulkBody, success: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/opportunities/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...body }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error((msg as { error?: string }).error || "Bulk action failed");
      }
      const data = (await res.json()) as { count: number };
      toast.success(success, `${data.count} ${data.count === 1 ? "opportunity" : "opportunities"}`);
      onClear();
      router.refresh();
    } catch (e) {
      toast.error("Action failed", e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/95 px-4 py-3 backdrop-blur">
      <span className="text-sm font-medium">
        {count} selected
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {/* Set status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              <Tag className="h-4 w-4" />
              Set status
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Set status to…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {OPPORTUNITY_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() => run({ action: "setStatus", status: s }, `Marked ${STATUS_META[s].label}`)}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[s].dot)} />
                {STATUS_META[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Watchlist */}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run({ action: "addToWatchlist" }, "Added to watchlist")}
        >
          <Star className="h-4 w-4" />
          Watchlist
        </Button>

        {/* Add to list */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              <ListPlus className="h-4 w-4" />
              Add to list
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Add to list…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {lists.length === 0 ? (
              <DropdownMenuItem disabled>No lists yet — create one first</DropdownMenuItem>
            ) : (
              lists.map((l) => (
                <DropdownMenuItem
                  key={l.id}
                  onClick={() => run({ action: "addToList", listId: l.id }, `Added to ${l.name}`)}
                >
                  {l.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ExportDialog ids={ids} />

        {/* Delete */}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>

        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Clear
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {count} {noun}?</DialogTitle>
            <DialogDescription>
              This permanently removes the selected {noun}, including notes, drafts and activity.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => run({ action: "delete" }, "Deleted")}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete {count} {noun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
