"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardPaste,
  Database,
  Loader2,
  Plus,
  Radar,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { discoveryMissionHref } from "@/lib/discovery-links";

type SearchMode = "focused" | "balanced" | "wide";
type AlertAction = "REMINDERS" | "DIGEST";

export type WorkflowLaneItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

type SourceRunResult = {
  status: string;
  found: number;
  created: number;
  updated: number;
  error?: string;
};

function pickDefaultLane(lanes: WorkflowLaneItem[]) {
  return lanes.find((lane) => lane.slug === "sme-ai-automation")?.id ?? lanes[0]?.id ?? "";
}

function sourceSummary(results: SourceRunResult[]) {
  if (results.length === 0) return "No due sources.";
  const created = results.reduce((sum, result) => sum + (result.created || 0), 0);
  const updated = results.reduce((sum, result) => sum + (result.updated || 0), 0);
  const failed = results.filter((result) => result.status === "ERROR").length;
  return `${results.length} ran - ${created} new - ${updated} updated${failed ? ` - ${failed} failed` : ""}`;
}

export function WorkflowUsecaseLauncher({ lanes }: { lanes: WorkflowLaneItem[] }) {
  const router = useRouter();
  const [laneId, setLaneId] = React.useState(() => pickDefaultLane(lanes));
  const [focus, setFocus] = React.useState("");
  const [searchMode, setSearchMode] = React.useState<SearchMode>("balanced");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [sourceResult, setSourceResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLaneId((current) => current || pickDefaultLane(lanes));
  }, [lanes]);

  async function queueDiscovery() {
    if (!laneId) return;
    setBusy("discovery");
    try {
      const res = await fetch("/api/discovery/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          laneId,
          query: focus || undefined,
          freeformBrief: focus || undefined,
          useAiPlanner: true,
          searchMode,
          includeWeb: true,
          includeSources: true,
          maxResults: searchMode === "wide" ? 18 : searchMode === "focused" ? 8 : 12,
          provider: "auto",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not queue discovery");
      toast.success("Discovery mission queued", "Opening the running mission.");
      router.push(discoveryMissionHref(data.mission?.id));
      router.refresh();
    } catch (err) {
      toast.error("Could not queue discovery", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  async function generateAlerts(type: AlertAction) {
    setBusy(type);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not run alert action");
      const created = Number(data?.created ?? 0);
      const emailed = Number(data?.emailed ?? 0);
      toast.success(
        type === "DIGEST" ? "Digest generated" : "Deadlines checked",
        emailed ? `${created} created - ${emailed} emailed` : `${created} created`,
      );
      router.refresh();
    } catch (err) {
      toast.error("Could not run alert action", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  async function runDueSources() {
    setBusy("sources");
    setSourceResult(null);
    try {
      const res = await fetch("/api/cron/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as { results?: SourceRunResult[]; error?: string } | null;
      const results = data?.results ?? [];
      if (!res.ok) throw new Error(data?.error || "Could not run due sources");
      const summary = sourceSummary(results);
      setSourceResult(summary);
      toast.success("Due sources checked", summary);
      router.refresh();
    } catch (err) {
      toast.error("Could not run due sources", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-md border border-border bg-surface/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Radar className="h-4 w-4 text-primary" />
          Find work
        </div>
        <div className="mt-3 space-y-2">
          <div className="space-y-1.5">
            <Label>Lane</Label>
            <Select value={laneId} onValueChange={setLaneId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose lane" />
              </SelectTrigger>
              <SelectContent>
                {lanes.map((lane) => (
                  <SelectItem key={lane.id} value={lane.id}>{lane.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workflow-focus">Focus</Label>
            <Input
              id="workflow-focus"
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              placeholder="Optional brief"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Select value={searchMode} onValueChange={(value) => setSearchMode(value as SearchMode)}>
              <SelectTrigger aria-label="Search mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="focused">Focused</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" onClick={queueDiscovery} disabled={!laneId || Boolean(busy)}>
              {busy === "discovery" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Queue
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BriefcaseBusiness className="h-4 w-4 text-primary" />
          Advance deals
        </div>
        <div className="mt-3 grid gap-2">
          <Button type="button" variant="outline" onClick={() => generateAlerts("REMINDERS")} disabled={Boolean(busy)}>
            {busy === "REMINDERS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Check deadlines
          </Button>
          <Button type="button" variant="outline" onClick={() => generateAlerts("DIGEST")} disabled={Boolean(busy)}>
            {busy === "DIGEST" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Generate digest
          </Button>
          <Button asChild variant="outline">
            <Link href="/opportunities?new=1">
              <Plus className="h-4 w-4" />
              New opportunity
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4 text-primary" />
          Expand surface area
        </div>
        <div className="mt-3 grid gap-2">
          <Button type="button" variant="outline" onClick={runDueSources} disabled={Boolean(busy)}>
            {busy === "sources" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Run due sources
          </Button>
          <Button asChild variant="outline">
            <Link href="/import">
              <ClipboardPaste className="h-4 w-4" />
              Paste community lead
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sources">
              <Plus className="h-4 w-4" />
              Add source
            </Link>
          </Button>
        </div>
        {sourceResult ? <p className="mt-2 text-xs text-muted-foreground">{sourceResult}</p> : null}
      </div>
    </div>
  );
}
