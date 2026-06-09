"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PRIORITY_LABELS: Record<string, string> = {
  "1": "Low priority",
  "2": "Medium priority",
  "3": "High priority",
};

/**
 * Reusable watchlist control: an "Add to watchlist" button plus a 1–3 priority
 * Select. Both POST /api/watchlist and refresh the route on success.
 */
export function WatchlistControls({
  opportunityId,
  initialPriority,
  pinned = false,
  size = "sm",
}: {
  opportunityId: string;
  initialPriority?: number;
  pinned?: boolean;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [isPinned, setIsPinned] = React.useState(pinned);
  const [priority, setPriority] = React.useState<string>(String(initialPriority ?? 1));
  const [pending, setPending] = React.useState(false);

  async function persist(nextPriority: string) {
    setPending(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, priority: Number(nextPriority) }),
      });
      if (!res.ok) throw new Error("Failed to update watchlist");
      setIsPinned(true);
      router.refresh();
    } catch {
      // Soft-fail: leave UI state unchanged.
    } finally {
      setPending(false);
    }
  }

  async function handleAdd() {
    if (pending) return;
    await persist(priority);
  }

  async function handlePriorityChange(value: string) {
    setPriority(value);
    if (isPinned) await persist(value);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isPinned ? "secondary" : "outline"}
        size={size}
        onClick={handleAdd}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPinned ? (
          <Check className="h-4 w-4" />
        ) : (
          <Star className="h-4 w-4" />
        )}
        {isPinned ? "On watchlist" : "Add to watchlist"}
      </Button>

      <Select value={priority} onValueChange={handlePriorityChange} disabled={pending}>
        <SelectTrigger
          className={cn("w-[150px]", size === "sm" && "h-8 text-xs")}
          aria-label="Watchlist priority"
        >
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          {(["3", "2", "1"] as const).map((p) => (
            <SelectItem key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
