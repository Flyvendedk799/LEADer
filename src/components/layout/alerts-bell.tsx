"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CalendarClock, CheckCheck, Loader2, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AlertRow {
  id: string;
  type: "DEADLINE" | "NEW_HIGH_MATCH" | "DIGEST" | "NEEDS_ACTION";
  title: string;
  body: string | null;
  channel: "LOCAL" | "EMAIL";
  payload: { opportunityId?: string } | null;
  createdAt: string;
}

const ICONS = {
  DEADLINE: CalendarClock,
  NEW_HIGH_MATCH: Sparkles,
  DIGEST: Mail,
  NEEDS_ACTION: AlertTriangle,
} as const;

export function AlertsBell() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) setAlerts(await res.json());
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(id: string, opportunityId?: string) {
    setAlerts((a) => a.filter((x) => x.id !== id));
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (opportunityId) router.push(`/opportunities/${opportunityId}`);
  }

  async function generate(type: "DIGEST" | "REMINDERS") {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      toast({
        title: type === "DIGEST" ? "Digest generated" : "Deadlines checked",
        description:
          type === "REMINDERS"
            ? `${data.created ?? 0} reminder(s)${data.emailed ? `, ${data.emailed} emailed` : ""}`
            : data.emailed
              ? "Emailed to you"
              : "Added to your inbox",
      });
      await load();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const count = alerts.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alerts" className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alerts</span>
          {count > 0 && <span className="text-xs font-normal text-muted-foreground">{count} unread</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {count === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            alerts.map((a) => {
              const Icon = ICONS[a.type] ?? Bell;
              return (
                <button
                  key={a.id}
                  onClick={() => markRead(a.id, a.payload?.opportunityId)}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{a.title}</span>
                    {a.body && <span className="line-clamp-2 text-xs text-muted-foreground">{a.body}</span>}
                  </span>
                  {a.channel === "EMAIL" && <Mail className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>

        <DropdownMenuSeparator />
        <div className="flex items-center gap-2 p-2">
          <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => generate("REMINDERS")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
            <span className={cn("ml-1.5")}>Deadlines</span>
          </Button>
          <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => generate("DIGEST")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Digest</span>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
