import Link from "next/link";
import type { ComponentProps } from "react";
import {
  Activity,
  Bell,
  Bot,
  FileText,
  Radar,
  RotateCw,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDate, truncate } from "@/lib/utils";

export type WorkflowActivityKind = "mission" | "workflow" | "source" | "alert" | "asset" | "opportunity";

export type WorkflowActivityItem = {
  id: string;
  kind: WorkflowActivityKind;
  title: string;
  description: string | null;
  status: string | null;
  href: string;
  createdAt: string;
};

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
  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No workflow activity yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
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
