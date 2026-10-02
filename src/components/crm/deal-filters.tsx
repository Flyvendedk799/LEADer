"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Columns3, List } from "lucide-react";
import { DEAL_STATUSES } from "@/lib/types";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function DealFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const selectClass = "h-10 min-w-0 rounded-md border bg-card px-3 text-sm";
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "status") {
      if (value === "all") {
        next.delete("status");
        next.set("scope", "all");
      } else next.delete("scope");
    }
    router.push(`/deals?${next}`);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <span className="flex items-center gap-2 rounded bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <List className="h-4 w-4" />
            List
          </span>
          <Link
            href={`/board?workspace=${params.get("workspace") || "DK"}`}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground"
          >
            <Columns3 className="h-4 w-4" />
            Board
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          From first signal to signed project.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <form
          className="relative min-w-[180px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            change("q", String(new FormData(e.currentTarget).get("q") || ""));
          }}
        >
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            key={params.get("q")}
            name="q"
            defaultValue={params.get("q") || ""}
            aria-label="Filter deals"
            placeholder="Search title, company, or category…"
            className="bg-card pl-9"
          />
        </form>
        <select
          className={selectClass}
          aria-label="Filter by stage"
          value={
            params.get("status") || (params.get("scope") === "all" ? "all" : "")
          }
          onChange={(e) => change("status", e.target.value)}
        >
          <option value="">Open stages</option>
          <option value="all">All stages</option>
          {DEAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {DEAL_STATUS_META[status].label}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          aria-label="Needs attention"
          value={params.get("attention") || ""}
          onChange={(e) => change("attention", e.target.value)}
        >
          <option value="">Any next action</option>
          <option value="no-action">Missing next action</option>
          <option value="stale">No progress in 14 days</option>
          <option value="deadline">Deadline this week</option>
        </select>
        <select
          className={selectClass}
          aria-label="Sort deals"
          value={params.get("sort") || "score"}
          onChange={(e) => change("sort", e.target.value)}
        >
          <option value="score">Best match</option>
          <option value="recent">Recently updated</option>
          <option value="deadline">Soonest deadline</option>
          <option value="value">Highest value</option>
        </select>
        {(params.get("q") ||
          params.get("status") ||
          params.get("attention")) && (
          <Button variant="ghost" asChild>
            <Link href={`/deals?workspace=${params.get("workspace") || "DK"}`}>
              Reset
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
