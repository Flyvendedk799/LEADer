"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { truncate } from "@/lib/utils";

type AlertType = "DEADLINE" | "NEW_HIGH_MATCH" | "DIGEST" | "NEEDS_ACTION";
type AlertChannel = "LOCAL" | "EMAIL";
type GenerateType = "REMINDERS" | "DIGEST";

export type WorkflowAlertItem = {
  id: string;
  type: AlertType;
  channel: AlertChannel;
  title: string;
  body: string | null;
  payload: { opportunityId?: string; workspace?: string } | null;
  createdAt: string;
};

const ICONS = {
  DEADLINE: CalendarClock,
  NEW_HIGH_MATCH: Sparkles,
  DIGEST: Mail,
  NEEDS_ACTION: AlertTriangle,
} as const;

function alertHref(alert: WorkflowAlertItem) {
  return alert.payload?.opportunityId ? `/opportunities/${alert.payload.opportunityId}` : "/";
}

function alertLabel(type: AlertType) {
  return type.toLowerCase().replaceAll("_", " ");
}

export function WorkflowAlertQueue({ alerts }: { alerts: WorkflowAlertItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(alerts);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState<GenerateType | null>(null);

  React.useEffect(() => {
    setItems(alerts);
  }, [alerts]);

  async function markRead(alert: WorkflowAlertItem) {
    const previous = items;
    setBusyId(alert.id);
    setItems((current) => current.filter((item) => item.id !== alert.id));

    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not update alert");
      toast.success("Alert handled", alert.title);
      router.refresh();
    } catch (err) {
      setItems(previous);
      toast.error("Could not update alert", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function generate(type: GenerateType) {
    setGenerating(type);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not generate alerts");
      const created = Number(data?.created ?? 0);
      const emailed = Number(data?.emailed ?? 0);
      toast.success(
        type === "DIGEST" ? "Digest generated" : "Deadlines checked",
        emailed ? `${created} created - ${emailed} emailed` : `${created} created`,
      );
      router.refresh();
    } catch (err) {
      toast.error("Could not generate alerts", err instanceof Error ? err.message : "Try again");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(generating)}
          onClick={() => generate("REMINDERS")}
        >
          {generating === "REMINDERS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          Deadlines
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(generating)}
          onClick={() => generate("DIGEST")}
        >
          {generating === "DIGEST" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Digest
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No unread alerts.</p>
      ) : (
        <div className="space-y-2">
          {items.map((alert) => {
            const Icon = ICONS[alert.type] ?? Bell;
            const href = alertHref(alert);
            const busy = busyId === alert.id;
            return (
              <div key={alert.id} className="rounded-md border border-border bg-surface/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link href={href} className="min-w-0 hover:text-primary">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{alert.title}</span>
                    </p>
                    {alert.body ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {truncate(alert.body, 140)}
                      </p>
                    ) : null}
                  </Link>
                  <Badge variant={alert.channel === "EMAIL" ? "secondary" : "outline"} className="shrink-0">
                    {alert.channel.toLowerCase()}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{alertLabel(alert.type)}</span>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      asChild
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      title="Open alert target"
                    >
                      <Link href={href} aria-label={`Open ${alert.title}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="success"
                      disabled={busy}
                      onClick={() => markRead(alert)}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
