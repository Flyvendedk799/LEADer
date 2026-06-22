"use client";

import * as React from "react";
import Link from "next/link";
import type { ComponentProps } from "react";
import {
  Activity,
  Bell,
  Bot,
  FileText,
  ListFilter,
  Radar,
  RotateCw,
  Search,
  X,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, truncate } from "@/lib/utils";
import {
  filterWorkflowActivityItems,
  workflowActivityKindCounts,
  type WorkflowActivityItem,
  type WorkflowActivityKind,
  type WorkflowActivityStatusFilter,
} from "@/lib/workflows/activity-feed";

export type { WorkflowActivityItem, WorkflowActivityKind } from "@/lib/workflows/activity-feed";

const ICONS: Record<WorkflowActivityKind, LucideIcon> = {
  mission: Radar,
  workflow: Workflow,
  source: RotateCw,
  alert: Bell,
  asset: Bot,
  opportunity: Activity,
};

function statusVariant(status: string | null): ComponentProps<typeof Badge>["variant"] {
  if (!status) return "outline";
  if (["SUCCESS", "DONE", "WON"].includes(status)) return "success";
  if (["ERROR", "DEADLINE", "NEEDS_ACTION"].includes(status)) return "warning";
  if (status === "CANCELED") return "muted";
  if (["RUNNING", "QUEUED"].includes(status)) return "secondary";
  return "outline";
}

export function WorkflowActivityFeed({ items }: { items: WorkflowActivityItem[] }) {
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<WorkflowActivityKind | "all">("all");
  const [status, setStatus] = React.useState<WorkflowActivityStatusFilter>("all");
  const filteredItems = React.useMemo(
    () => filterWorkflowActivityItems(items, { query, kind, status }),
    [items, kind, query, status],
  );
  const counts = React.useMemo(() => workflowActivityKindCounts(items), [items]);
  const filtered = query.trim() || kind !== "all" || status !== "all";

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No workflow activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_13rem_12rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter activity"
            className="pl-8"
          />
        </div>
        <Select value={kind} onValueChange={(value) => setKind(value as WorkflowActivityKind | "all")}>
          <SelectTrigger aria-label="Activity kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="workflow">Workflow ({counts.workflow})</SelectItem>
            <SelectItem value="mission">Missions ({counts.mission})</SelectItem>
            <SelectItem value="source">Sources ({counts.source})</SelectItem>
            <SelectItem value="alert">Alerts ({counts.alert})</SelectItem>
            <SelectItem value="asset">Assets ({counts.asset})</SelectItem>
            <SelectItem value="opportunity">Opportunities ({counts.opportunity})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value as WorkflowActivityStatusFilter)}>
          <SelectTrigger aria-label="Activity status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="attention">Attention</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!filtered}
          onClick={() => {
            setQuery("");
            setKind("all");
            setStatus("all");
          }}
        >
          {filtered ? <X className="h-4 w-4" /> : <ListFilter className="h-4 w-4" />}
          {filteredItems.length}/{items.length}
        </Button>
      </div>

      {filteredItems.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No matching workflow activity.</p>
      ) : null}

      {filteredItems.map((item) => {
        const Icon = ICONS[item.kind] ?? FileText;
        return (
          <Link
            key={item.id}
            href={item.href}
            className="grid gap-2 rounded-md border border-border bg-surface/40 p-3 transition-colors hover:border-primary/50 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{item.title}</span>
              </p>
              {item.description ? (
                <p className="mt-1 truncate text-xs text-muted-foreground">{truncate(item.description, 140)}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground md:justify-end">
              {item.status ? <Badge variant={statusVariant(item.status)}>{item.status.toLowerCase()}</Badge> : null}
              <span className="whitespace-nowrap">{formatDate(item.createdAt)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
