"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  BookmarkPlus,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardPaste,
  Database,
  Loader2,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { discoveryMissionHref } from "@/lib/discovery-links";
import { operatingDayPresetPayload } from "@/lib/workflows/usecase-actions";
import type { Workspace } from "@/lib/types";
import { workspaceFromRoute, workspaceLabel } from "@/lib/workspace-context";
import { ResearchBriefLauncher } from "./research-brief-launcher";

type SearchMode = "focused" | "balanced" | "wide";
type AlertAction = "REMINDERS" | "DIGEST";

type DailySweepResult = {
  sources?: {
    ran: number;
    created: number;
    updated: number;
    failed: number;
  };
  reminders?: {
    created: number;
    emailed: number;
  };
  digest?: {
    created: number;
    emailed: number;
  };
  log?: string[];
};

type WorkflowRunResponse = {
  queued?: boolean;
  run?: {
    id: string;
    status: string;
    log: string[];
    result?: DailySweepResult | null;
  };
  error?: unknown;
};

type WorkflowPresetResponse = {
  preset?: {
    id: string;
    name: string;
  };
  error?: unknown;
};

type WorkflowRunPreview = {
  phases?: {
    dailySweep: boolean;
    candidateHarvest: boolean;
    pipelineRescue: boolean;
  };
  dailySweep?: {
    includeSources: boolean;
    includeAlerts: boolean;
    dueSources: number;
  };
  candidateHarvest?: {
    minScore: number;
    limit: number;
    matchingCandidates: number;
    willReview: number;
  };
  pipelineRescue?: {
    staleDeals: number;
    deadlineDeals: number;
    willReview: number;
  };
};

type WorkflowPlaybook = "daily-sweep" | "pipeline-rescue" | "candidate-harvest" | "operating-day";
type WorkflowRunOptions = {
  dailySweep?: {
    includeSources?: boolean;
    includeAlerts?: boolean;
  };
  candidateHarvest?: {
    minScore?: number;
    limit?: number;
  };
  pipelineRescue?: {
    staleDays?: number;
    deadlineDays?: number;
    limit?: number;
  };
  operatingDay?: {
    dailySweep?: boolean;
    candidateHarvest?: boolean;
    pipelineRescue?: boolean;
  };
};

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

function dailySweepSummary(result: DailySweepResult) {
  const sources = result.sources;
  const reminders = result.reminders;
  const digest = result.digest;
  const sourcePart = sources
    ? `${sources.ran} sources - ${sources.created} new - ${sources.updated} updated${sources.failed ? ` - ${sources.failed} failed` : ""}`
    : "Sources checked";
  const alertPart = `${reminders?.created ?? 0} reminders - ${digest?.created ?? 0} digest`;
  const emailed = (reminders?.emailed ?? 0) + (digest?.emailed ?? 0);
  return emailed ? `${sourcePart} - ${alertPart} - ${emailed} emailed` : `${sourcePart} - ${alertPart}`;
}

export function WorkflowUsecaseLauncher({ lanes }: { lanes: WorkflowLaneItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeWorkspace = workspaceFromRoute(pathname, searchParams);
  const [workspace, setWorkspace] = React.useState<Workspace>(routeWorkspace);
  const [laneId, setLaneId] = React.useState(() => pickDefaultLane(lanes));
  const [focus, setFocus] = React.useState("");
  const [searchMode, setSearchMode] = React.useState<SearchMode>("balanced");
  const [daySweep, setDaySweep] = React.useState(true);
  const [dayHarvest, setDayHarvest] = React.useState(true);
  const [dayRescue, setDayRescue] = React.useState(true);
  const [daySources, setDaySources] = React.useState(true);
  const [dayAlerts, setDayAlerts] = React.useState(true);
  const [candidateMinScore, setCandidateMinScore] = React.useState(70);
  const [candidateLimit, setCandidateLimit] = React.useState(5);
  const [pipelineStaleDays, setPipelineStaleDays] = React.useState(14);
  const [pipelineDeadlineDays, setPipelineDeadlineDays] = React.useState(7);
  const [pipelineLimit, setPipelineLimit] = React.useState(12);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [sourceResult, setSourceResult] = React.useState<string | null>(null);
  const [sweepResult, setSweepResult] = React.useState<DailySweepResult | null>(null);
  const [sweepRun, setSweepRun] = React.useState<WorkflowRunResponse["run"] | null>(null);
  const [preview, setPreview] = React.useState<WorkflowRunPreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  React.useEffect(() => {
    setLaneId((current) => current || pickDefaultLane(lanes));
  }, [lanes]);

  React.useEffect(() => {
    setWorkspace(routeWorkspace);
  }, [routeWorkspace]);

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
          workspace,
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
        body: JSON.stringify({ type, workspace }),
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

  function numberChange(setValue: React.Dispatch<React.SetStateAction<number>>, min: number, max: number) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.currentTarget.value);
      if (!Number.isFinite(next)) return;
      setValue(Math.min(max, Math.max(min, next)));
    };
  }

  function operatingDayOptions(): WorkflowRunOptions {
    return {
      operatingDay: {
        dailySweep: daySweep,
        candidateHarvest: dayHarvest,
        pipelineRescue: dayRescue,
      },
      dailySweep: {
        includeSources: daySources,
        includeAlerts: dayAlerts,
      },
      candidateHarvest: {
        minScore: candidateMinScore,
        limit: candidateLimit,
      },
      pipelineRescue: {
        staleDays: pipelineStaleDays,
        deadlineDays: pipelineDeadlineDays,
        limit: pipelineLimit,
      },
    };
  }

  const currentOperatingDayOptions = React.useMemo(
    () => ({
      operatingDay: {
        dailySweep: daySweep,
        candidateHarvest: dayHarvest,
        pipelineRescue: dayRescue,
      },
      dailySweep: {
        includeSources: daySources,
        includeAlerts: dayAlerts,
      },
      candidateHarvest: {
        minScore: candidateMinScore,
        limit: candidateLimit,
      },
      pipelineRescue: {
        staleDays: pipelineStaleDays,
        deadlineDays: pipelineDeadlineDays,
        limit: pipelineLimit,
      },
    }),
    [
      candidateLimit,
      candidateMinScore,
      dayAlerts,
      dayHarvest,
      dayRescue,
      daySources,
      daySweep,
      pipelineDeadlineDays,
      pipelineLimit,
      pipelineStaleDays,
    ],
  );

  React.useEffect(() => {
    if (!daySweep && !dayHarvest && !dayRescue) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    let stopped = false;
    const controller = new AbortController();
    setPreviewLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/workflows/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            playbook: "operating-day",
            workspace,
            options: currentOperatingDayOptions,
          }),
        });
        const data = (await res.json().catch(() => null)) as { preview?: WorkflowRunPreview } | null;
        if (!stopped && res.ok) setPreview(data?.preview ?? null);
      } catch {
        if (!stopped) setPreview(null);
      } finally {
        if (!stopped) setPreviewLoading(false);
      }
    }, 300);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [currentOperatingDayOptions, dayHarvest, dayRescue, daySweep, workspace]);

  async function runDailySweep() {
    setBusy("daily-sweep");
    setSweepResult(null);
    setSweepRun(null);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook: "daily-sweep", workspace }),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) throw new Error(String(data?.error || "Could not queue daily sweep"));
      setSweepRun(data.run);
      toast.success("Daily sweep queued", `${workspaceLabel(workspace)} workspace. It will keep running in the background.`);
      router.refresh();
    } catch (err) {
      toast.error("Could not queue daily sweep", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  async function queueWorkflowPlaybook(
    playbook: WorkflowPlaybook,
    busyKey: string,
    label: string,
    options?: WorkflowRunOptions,
  ) {
    setBusy(busyKey);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook, workspace, options }),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) throw new Error(String(data?.error || `Could not queue ${label.toLowerCase()}`));
      toast.success(`${label} queued`, `${workspaceLabel(workspace)} workspace. It will keep running in the background.`);
      router.refresh();
    } catch (err) {
      toast.error(`Could not queue ${label.toLowerCase()}`, err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  async function saveOperatingDayMode() {
    setBusy("save-operating-day");
    try {
      const res = await fetch("/api/workflows/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operatingDayPresetPayload(currentOperatingDayOptions, undefined, workspace)),
      });
      const data = (await res.json().catch(() => null)) as WorkflowPresetResponse | null;
      if (!res.ok || !data?.preset) throw new Error(String(data?.error || "Could not save operating mode"));
      toast.success("Operating mode saved", data.preset.name);
      router.refresh();
    } catch (err) {
      toast.error("Could not save operating mode", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(null);
    }
  }

  React.useEffect(() => {
    if (!sweepRun?.id || !["QUEUED", "RUNNING"].includes(sweepRun.status)) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/workflows/run", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { runs?: WorkflowRunResponse["run"][] } | null;
        const next = data?.runs?.find((run) => run?.id === sweepRun.id);
        if (!next || stopped) return;
        setSweepRun(next);
        if (next.result) setSweepResult(next.result);
        if (!["QUEUED", "RUNNING"].includes(next.status)) {
          window.clearInterval(timer);
          if (next.status === "SUCCESS" && next.result) {
            toast.success("Daily sweep finished", dailySweepSummary(next.result));
          } else if (next.status === "ERROR") {
            toast.error("Daily sweep failed", next.log.at(-1) ?? "Check playbook runs.");
          }
          router.refresh();
        }
      } catch {
        // Keep the page quiet; the durable run remains visible in Playbook runs.
      }
    }, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [router, sweepRun?.id, sweepRun?.status]);

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
      <div className="rounded-md border border-border bg-surface/40 p-3 md:col-span-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Operating day
            </div>
            <div className="grid gap-2 sm:flex sm:items-center sm:justify-end">
              <Select value={workspace} onValueChange={(value) => setWorkspace(value as Workspace)}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DK">Denmark</SelectItem>
                  <SelectItem value="GLOBAL">International</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={saveOperatingDayMode}
                disabled={Boolean(busy) || (!daySweep && !dayHarvest && !dayRescue)}
                className="w-full sm:w-auto"
              >
                {busy === "save-operating-day" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                Save mode
              </Button>
              <Button
                type="button"
                onClick={() => queueWorkflowPlaybook("operating-day", "operating-day", "Operating day", operatingDayOptions())}
                disabled={Boolean(busy) || (!daySweep && !dayHarvest && !dayRescue)}
                className="w-full sm:w-auto"
              >
                {busy === "operating-day" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Run day
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <SwitchControl id="day-sweep" label="Sweep" checked={daySweep} onCheckedChange={setDaySweep} />
            <SwitchControl id="day-harvest" label="Harvest" checked={dayHarvest} onCheckedChange={setDayHarvest} />
            <SwitchControl id="day-rescue" label="Rescue" checked={dayRescue} onCheckedChange={setDayRescue} />
            <SwitchControl id="day-sources" label="Sources" checked={daySources} onCheckedChange={setDaySources} disabled={!daySweep} />
            <SwitchControl id="day-alerts" label="Alerts" checked={dayAlerts} onCheckedChange={setDayAlerts} disabled={!daySweep} />
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <NumberControl
              id="candidate-min-score"
              label="Min score"
              value={candidateMinScore}
              min={0}
              max={100}
              onChange={numberChange(setCandidateMinScore, 0, 100)}
              disabled={!dayHarvest}
            />
            <NumberControl
              id="candidate-limit"
              label="Candidates"
              value={candidateLimit}
              min={1}
              max={20}
              onChange={numberChange(setCandidateLimit, 1, 20)}
              disabled={!dayHarvest}
            />
            <NumberControl
              id="pipeline-stale-days"
              label="Stale days"
              value={pipelineStaleDays}
              min={1}
              max={90}
              onChange={numberChange(setPipelineStaleDays, 1, 90)}
              disabled={!dayRescue}
            />
            <NumberControl
              id="pipeline-deadline-days"
              label="Deadline days"
              value={pipelineDeadlineDays}
              min={1}
              max={60}
              onChange={numberChange(setPipelineDeadlineDays, 1, 60)}
              disabled={!dayRescue}
            />
            <NumberControl
              id="pipeline-limit"
              label="Deal limit"
              value={pipelineLimit}
              min={1}
              max={50}
              onChange={numberChange(setPipelineLimit, 1, 50)}
              disabled={!dayRescue}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <PreviewMetric
              label="Due sources"
              value={preview?.dailySweep?.dueSources ?? 0}
              muted={!daySweep || !daySources}
              loading={previewLoading}
            />
            <PreviewMetric
              label="Candidates"
              value={preview?.candidateHarvest?.willReview ?? 0}
              muted={!dayHarvest}
              loading={previewLoading}
            />
            <PreviewMetric
              label="Stale deals"
              value={preview?.pipelineRescue?.staleDeals ?? 0}
              muted={!dayRescue}
              loading={previewLoading}
            />
            <PreviewMetric
              label="Deadlines"
              value={preview?.pipelineRescue?.deadlineDeals ?? 0}
              muted={!dayRescue}
              loading={previewLoading}
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface/40 p-3 md:col-span-3">
        <ResearchBriefLauncher workspace={workspace} />
      </div>

      <div className="rounded-md border border-border bg-surface/40 p-3 md:col-span-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw className="h-4 w-4 text-primary" />
              Daily sweep
            </div>
            {sweepResult ? (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>{dailySweepSummary(sweepResult)}</p>
                {sweepResult.log?.slice(-3).map((entry, index) => (
                  <p key={`${entry}-${index}`} className="font-mono text-[11px]">
                    {entry}
                  </p>
                ))}
              </div>
            ) : sweepRun ? (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>Queued as {sweepRun.status.toLowerCase()} background run.</p>
                {sweepRun.log?.slice(-3).map((entry, index) => (
                  <p key={`${entry}-${index}`} className="font-mono text-[11px]">
                    {entry}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <Button type="button" onClick={runDailySweep} disabled={Boolean(busy)} className="w-full sm:w-auto">
            {busy === "daily-sweep" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run sweep
          </Button>
        </div>
      </div>

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
          <Button
            type="button"
            variant="outline"
            onClick={() => queueWorkflowPlaybook("pipeline-rescue", "pipeline-rescue", "Pipeline rescue")}
            disabled={Boolean(busy)}
          >
            {busy === "pipeline-rescue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}
            Rescue pipeline
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => queueWorkflowPlaybook("candidate-harvest", "candidate-harvest", "Candidate harvest")}
            disabled={Boolean(busy)}
          >
            {busy === "candidate-harvest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            Harvest candidates
          </Button>
          <Button type="button" variant="outline" onClick={() => generateAlerts("REMINDERS")} disabled={Boolean(busy)}>
            {busy === "REMINDERS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Check deadlines
          </Button>
          <Button type="button" variant="outline" onClick={() => generateAlerts("DIGEST")} disabled={Boolean(busy)}>
            {busy === "DIGEST" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Generate digest
          </Button>
          <Button asChild variant="outline">
            <Link href={`/opportunities?new=1&workspace=${workspace}`}>
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

function PreviewMetric({
  label,
  value,
  muted,
  loading,
}: {
  label: string;
  value: number;
  muted?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`rounded-md border border-border bg-card px-3 py-2 ${muted ? "opacity-50" : ""}`}>
      <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-normal">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : value}
      </p>
    </div>
  );
}

function SwitchControl({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

function NumberControl({
  id,
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="h-9"
      />
    </div>
  );
}
