"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  Clock3,
  Link2,
  CopyX,
  Database,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { DiscoveryLane } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/shared/score-badge";
import { discoveryMissionHref } from "@/lib/discovery-links";
import { cn, formatBudget, formatDate, truncate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Provider = "auto" | "tavily" | "brave" | "serper" | "none";
type CandidateAction = "review" | "save" | "dismiss" | "duplicate";

type Candidate = {
  id: string;
  title: string;
  description?: string | null;
  rawContent?: string | null;
  url?: string | null;
  organization?: string | null;
  sourceName?: string | null;
  sourceKind?: string | null;
  provider?: string | null;
  query?: string | null;
  status: string;
  category?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  currency?: string | null;
  deadline?: string | Date | null;
  pursuitScore?: number | null;
  confidenceScore?: number | null;
  signals: string[];
  reasons: string[];
  deal?: { id: string; title: string } | null;
  evidence?: { id: string; title?: string | null; snippet: string; url?: string | null; confidence?: number | null }[];
};

type MissionResult = {
  mission: {
    id: string;
    status: string;
    provider?: string | null;
    startedAt?: string | Date;
    finishedAt?: string | Date | null;
    query?: string;
    lane?: { id: string; name: string } | null;
    sourceScanCount?: number;
    warnings: string[];
    log: string[];
    candidates: Candidate[];
  };
  providerConfigured?: boolean;
  queries?: string[];
  plan?: {
    summary: string;
    queries: string[];
    requiredTerms: string[];
    excludedTerms: string[];
    positiveKeywords: string[];
    evidenceRequirements: string[];
    suggestedLaneSlug?: string;
    confidence: number;
    notes: string[];
  };
};

type SearchMode = "focused" | "balanced" | "wide";

type MissionSummary = {
  id: string;
  status: string;
  provider?: string | null;
  startedAt: string | Date;
  finishedAt?: string | Date | null;
  query: string;
  lane?: { id: string; name: string } | null;
  warnings: string[];
  log?: string[];
  sourceScanCount?: number;
  _count?: { candidates: number };
};

function listFromInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function missionCandidateCount(mission: MissionSummary) {
  return mission._count?.candidates ?? 0;
}

function missionStatusVariant(status: string): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "SUCCESS") return "success";
  if (status === "ERROR") return "warning";
  if (status === "RUNNING" || status === "QUEUED") return "secondary";
  return "outline";
}

function missionTime(value?: string | Date | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function missionDuration(start?: string | Date, end?: string | Date | null) {
  if (!start) return "";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function missionLogParts(entry: string) {
  const [stamp, ...rest] = entry.split(" ");
  const date = new Date(stamp);
  return {
    time: Number.isNaN(date.getTime()) ? "" : missionTime(date),
    message: rest.join(" ") || entry,
  };
}

function queryPreview(value?: string) {
  return (value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "Discovery mission";
}

export function LaneMissionControl({
  lanes,
  initialMissionId,
}: {
  lanes: DiscoveryLane[];
  initialMissionId?: string | null;
}) {
  const router = useRouter();
  const initialMissionLoadedRef = React.useRef<string | null>(null);
  const [laneId, setLaneId] = React.useState(lanes[0]?.id ?? "");
  const [query, setQuery] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>("auto");
  const [searchMode, setSearchMode] = React.useState<SearchMode>("balanced");
  const [useAiPlanner, setUseAiPlanner] = React.useState(true);
  const [requiredTerms, setRequiredTerms] = React.useState("");
  const [excludedTerms, setExcludedTerms] = React.useState("");
  const [maxResults, setMaxResults] = React.useState("16");
  const [includeWeb, setIncludeWeb] = React.useState(true);
  const [includeSources, setIncludeSources] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [missions, setMissions] = React.useState<MissionSummary[]>([]);
  const [activeMissionId, setActiveMissionId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<MissionResult | null>(null);
  const selectedLane = lanes.find((lane) => lane.id === laneId);
  const candidates = result?.mission.candidates ?? [];
  const missionStatus = result?.mission.status ?? "";
  const missionRunning = missionStatus === "QUEUED" || missionStatus === "RUNNING";
  const counts = candidates.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.status] = (acc[candidate.status] ?? 0) + 1;
    return acc;
  }, {});

  const mergeMission = React.useCallback((mission: MissionSummary) => {
    setMissions((current) => {
      const next = current.filter((item) => item.id !== mission.id);
      return [mission, ...next].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ).slice(0, 20);
    });
  }, []);

  const syncMissionUrl = React.useCallback((id: string) => {
    window.history.replaceState(window.history.state, "", discoveryMissionHref(id));
  }, []);

  const loadMission = React.useCallback(async (id: string, quiet = false, syncUrl = true) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch(`/api/discovery/runs/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load mission");
      setResult(data);
      setActiveMissionId(data.mission.id);
      if (syncUrl) syncMissionUrl(data.mission.id);
      mergeMission({
        id: data.mission.id,
        status: data.mission.status,
        provider: data.mission.provider,
        startedAt: data.mission.startedAt,
        finishedAt: data.mission.finishedAt,
        query: data.mission.query || "",
        lane: data.mission.lane,
        warnings: data.mission.warnings ?? [],
        sourceScanCount: data.mission.sourceScanCount,
        _count: { candidates: data.mission.candidates?.length ?? 0 },
      });
    } catch (err) {
      if (!quiet) toast.error("Could not load mission", err instanceof Error ? err.message : "Try again");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [mergeMission, syncMissionUrl]);

  const loadMissions = React.useCallback(async (openLatest = false, quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch("/api/discovery/runs", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load mission history");
      const loaded = (data.missions ?? []) as MissionSummary[];
      setMissions(loaded);
      if (openLatest && loaded[0]) {
        void loadMission(loaded[0].id, true, false);
      }
    } catch (err) {
      if (!quiet) toast.error("Could not load missions", err instanceof Error ? err.message : "Try again");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [loadMission]);

  React.useEffect(() => {
    const targetMissionId = initialMissionId?.trim() || null;
    if (initialMissionLoadedRef.current === targetMissionId) return;
    initialMissionLoadedRef.current = targetMissionId;
    if (targetMissionId) {
      void loadMission(targetMissionId, false, false);
      void loadMissions(false, true);
      return;
    }
    void loadMissions(true);
  }, [initialMissionId, loadMission, loadMissions]);

  React.useEffect(() => {
    if (!result || !window.location.hash) return;
    const hashId = decodeURIComponent(window.location.hash.slice(1));
    if (!hashId.startsWith("candidate-")) return;
    window.requestAnimationFrame(() => {
      document.getElementById(hashId)?.scrollIntoView({ block: "start" });
    });
  }, [result]);

  React.useEffect(() => {
    if (!activeMissionId || !missionRunning) return undefined;
    const timer = window.setInterval(() => {
      void loadMission(activeMissionId, true);
      void loadMissions(false, true);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [activeMissionId, loadMission, loadMissions, missionRunning]);

  React.useEffect(() => {
    if (!missions.some((mission) => mission.status === "QUEUED" || mission.status === "RUNNING")) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadMissions(false, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadMissions, missions]);

  async function runMission(e: React.FormEvent) {
    e.preventDefault();
    if (!laneId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/discovery/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          laneId,
          query: query || undefined,
          freeformBrief: query || undefined,
          useAiPlanner,
          searchMode,
          requiredTerms: listFromInput(requiredTerms),
          excludedTerms: listFromInput(excludedTerms),
          provider,
          includeWeb,
          includeSources,
          maxResults: Number(maxResults) || 16,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Discovery failed");
      setResult(data);
      setActiveMissionId(data.mission.id);
      syncMissionUrl(data.mission.id);
      mergeMission({
        id: data.mission.id,
        status: data.mission.status,
        provider: data.mission.provider,
        startedAt: data.mission.startedAt,
        finishedAt: data.mission.finishedAt,
        query: data.mission.query || "",
        lane: data.mission.lane,
        warnings: data.mission.warnings ?? [],
        sourceScanCount: data.mission.sourceScanCount,
        _count: { candidates: data.mission.candidates?.length ?? 0 },
      });
      toast.success("Discovery mission queued");
    } catch (err) {
      toast.error("Discovery failed", err instanceof Error ? err.message : "Could not run the lane");
    } finally {
      setLoading(false);
    }
  }

  async function copyActiveMissionLink() {
    if (!activeMissionId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${discoveryMissionHref(activeMissionId)}`);
      toast.success("Mission link copied");
    } catch {
      toast.error("Could not copy link", "Your browser blocked clipboard access.");
    }
  }

  async function candidateAction(id: string, action: CandidateAction) {
    try {
      const res = await fetch(`/api/discovery/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: action === "dismiss" ? "Not a fit right now" : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Action failed");
      toast.success(action === "save" ? "Saved as deal" : "Candidate updated");
      setResult((current) =>
        current
          ? {
              ...current,
              mission: {
                ...current.mission,
                candidates: current.mission.candidates.map((candidate) =>
                  candidate.id === id
                    ? {
                        ...candidate,
                        status:
                          action === "save"
                            ? "SAVED"
                            : action === "dismiss"
                              ? "DISMISSED"
                              : action === "duplicate"
                                ? "DUPLICATE"
                                : "REVIEWED",
                        deal: data.deal ?? candidate.deal,
                      }
                    : candidate,
                ),
              },
            }
          : current,
      );
      router.refresh();
    } catch (err) {
      toast.error("Action failed", err instanceof Error ? err.message : "Try again");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <form onSubmit={runMission} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label>Discovery lane</Label>
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
                {selectedLane && (
                  <p className="text-sm leading-6 text-muted-foreground">{selectedLane.description}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mission-focus">Freeform mission brief</Label>
                <Textarea
                  id="mission-focus"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Describe the lead shape in plain language, e.g. AI automation for Danish SMEs with reporting pain"
                  className="min-h-28 resize-y"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-border bg-surface/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                Scan controls
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select value={provider} onValueChange={(value) => setProvider(value as Provider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="tavily">Tavily</SelectItem>
                      <SelectItem value="brave">Brave</SelectItem>
                      <SelectItem value="serper">Serper</SelectItem>
                      <SelectItem value="none">Sources only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mission-max">Results</Label>
                  <Input
                    id="mission-max"
                    type="number"
                    min={4}
                    max={30}
                    value={maxResults}
                    onChange={(e) => setMaxResults(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Search style</Label>
                <Select value={searchMode} onValueChange={(value) => setSearchMode(value as SearchMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="focused">Focused</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="wide">Wide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
                <Label htmlFor="mission-ai" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI freeform planner
                </Label>
                <Switch id="mission-ai" checked={useAiPlanner} onCheckedChange={setUseAiPlanner} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mission-required">Must include</Label>
                <Input
                  id="mission-required"
                  value={requiredTerms}
                  onChange={(e) => setRequiredTerms(e.target.value)}
                  placeholder="Comma separated"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mission-excluded">Exclude</Label>
                <Input
                  id="mission-excluded"
                  value={excludedTerms}
                  onChange={(e) => setExcludedTerms(e.target.value)}
                  placeholder="jobs, courses, webinars"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="mission-web" className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4" />
                  Web
                </Label>
                <Switch id="mission-web" checked={includeWeb} onCheckedChange={setIncludeWeb} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="mission-sources" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Sources
                </Label>
                <Switch id="mission-sources" checked={includeSources} onCheckedChange={setIncludeSources} />
              </div>
              <Button type="submit" disabled={loading || !laneId || (!includeWeb && !includeSources)} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Queue lane
              </Button>
            </div>
          </div>
        </form>

        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {missionRunning ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                    {result.mission.lane?.name ?? "Discovery mission"}
                    <Badge variant={missionStatusVariant(result.mission.status)}>{result.mission.status.toLowerCase()}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"}
                    {" · "}
                    {result.mission.provider || "web"} search
                    {" · "}
                    {result.mission.sourceScanCount ?? 0} sources scanned
                    {" · "}
                    {missionDuration(result.mission.startedAt, result.mission.finishedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyActiveMissionLink}
                    disabled={!activeMissionId}
                  >
                    <Link2 className="h-4 w-4" />
                    Copy link
                  </Button>
                  {["NEW", "REVIEWED", "SAVED", "DISMISSED", "DUPLICATE"].map((status) => (
                    counts[status] ? <Badge key={status} variant="outline">{status.toLowerCase()}: {counts[status]}</Badge> : null
                  ))}
                </div>
              </div>
            </div>

            {candidates.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {missionRunning ? "Mission running in background." : "No candidates found for this mission."}
                </CardContent>
              </Card>
            ) : (
              candidates.map((candidate) => (
                <CandidateCard key={candidate.id} candidate={candidate} onAction={candidateAction} />
              ))
            )}
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Mission history
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void loadMissions(false)}
                disabled={refreshing}
                title="Refresh"
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {missions.length ? (
              missions.map((mission) => (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => void loadMission(mission.id, false, true)}
                  className={cn(
                    "w-full rounded-md border border-border bg-surface/40 p-2 text-left transition hover:border-primary/40 hover:bg-surface",
                    activeMissionId === mission.id && "border-primary/50 bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{mission.lane?.name ?? "Discovery mission"}</span>
                    <Badge variant={missionStatusVariant(mission.status)}>{mission.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{queryPreview(mission.query)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      {missionTime(mission.startedAt)}
                    </span>
                    <span>{missionDuration(mission.startedAt, mission.finishedAt)}</span>
                    <span>{missionCandidateCount(mission)} candidates</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="py-3 text-sm text-muted-foreground">No missions yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radar className="h-4 w-4 text-primary" />
              Lane playbook
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {selectedLane ? (
              <>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Evidence</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLane.evidenceRequirements.map((item) => (
                      <Badge key={item} variant="outline" className="max-w-full truncate" title={item}>{item}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Positive signals</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLane.positiveKeywords.slice(0, 9).map((item) => (
                      <Badge key={item} variant="secondary" className="max-w-full truncate" title={item}>{item}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Conversion angle</p>
                  <p className="leading-6 text-muted-foreground">{selectedLane.conversionGuidance}</p>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Choose a lane to inspect its playbook.</p>
            )}
          </CardContent>
        </Card>

        {result?.plan ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                AI search plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="leading-6 text-muted-foreground">{result.plan.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{result.plan.confidence}% confidence</Badge>
                {result.plan.requiredTerms.map((term) => (
                  <Badge key={`required-${term}`} variant="secondary">must: {term}</Badge>
                ))}
                {result.plan.excludedTerms.map((term) => (
                  <Badge key={`exclude-${term}`} variant="warning">avoid: {term}</Badge>
                ))}
              </div>
              {result.plan.notes.length ? (
                <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                  {result.plan.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {result?.queries?.length ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Generated probes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {result.queries.map((generatedQuery) => (
                  <li key={generatedQuery} className="rounded-md bg-surface/70 p-2 leading-5">
                    {generatedQuery}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {result?.mission.warnings?.length ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 text-warning" />
                Warnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-warning">
                {result.mission.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {result?.mission.log?.length ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" />
                Activity log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-xs text-muted-foreground">
                {result.mission.log.slice(-12).map((entry, index) => {
                  const item = missionLogParts(entry);
                  return (
                    <li key={`${entry}-${index}`} className="rounded-md bg-surface/70 p-2 leading-5">
                      {item.time ? <span className="mr-2 font-medium text-foreground">{item.time}</span> : null}
                      <span>{item.message}</span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

function CandidateCard({
  candidate,
  onAction,
}: {
  candidate: Candidate;
  onAction: (id: string, action: CandidateAction) => void;
}) {
  const saved = candidate.status === "SAVED" && candidate.deal;
  const closed = candidate.status === "DISMISSED" || candidate.status === "DUPLICATE";
  const evidence = candidate.evidence?.slice(0, 3) ?? [];
  const statusVariant =
    candidate.status === "SAVED"
      ? "success"
      : candidate.status === "DISMISSED" || candidate.status === "DUPLICATE"
        ? "muted"
        : candidate.status === "REVIEWED"
          ? "secondary"
          : "default";

  return (
    <article id={`candidate-${candidate.id}`} className="scroll-mt-24 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-base font-semibold leading-snug">{candidate.title}</h2>
            {candidate.url && (
              <a href={candidate.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <Badge variant={statusVariant}>{candidate.status.toLowerCase()}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {[candidate.organization, candidate.sourceName, candidate.category].filter(Boolean).join(" · ") || "Discovery candidate"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <ScoreBadge score={candidate.confidenceScore} size="sm" />
            <p className="mt-1 text-[10px] uppercase text-muted-foreground">Confidence</p>
          </div>
          <div className="text-center">
            <ScoreBadge score={candidate.pursuitScore} size="lg" showLabel />
            <p className="mt-1 text-[10px] uppercase text-muted-foreground">Pursuit</p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {truncate(candidate.description || candidate.rawContent, 460)}
      </p>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Meta label="Budget" value={formatBudget(candidate.budgetMin, candidate.budgetMax, candidate.currency ?? "DKK")} />
        <Meta label="Deadline" value={formatDate(candidate.deadline)} />
        <Meta label="Source" value={candidate.sourceKind === "source-scan" ? "saved source" : candidate.provider || "web"} />
        <Meta label="Status" value={candidate.status.toLowerCase()} />
      </div>

      {(candidate.signals.length > 0 || candidate.reasons.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[...candidate.signals, ...candidate.reasons].slice(0, 12).map((signal) => (
            <Badge key={signal} variant={signal.startsWith("avoid:") || signal.startsWith("Negative") ? "warning" : "secondary"} className="max-w-full truncate" title={signal}>
              {signal}
            </Badge>
          ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="mt-4 grid gap-2">
          {evidence.map((item) => (
            <div key={item.id} className="rounded-md border border-border bg-surface/50 p-3 text-sm text-muted-foreground">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{item.title || "Evidence"}</p>
                {item.confidence != null && <Badge variant="outline">{item.confidence}% confidence</Badge>}
              </div>
              <p className="leading-6">{truncate(item.snippet, 300)}</p>
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  Source
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        {saved ? (
          <Button asChild size="sm">
            <Link href={`/deals/${candidate.deal!.id}`}>
              <CheckCircle2 className="h-4 w-4" />
              Open deal
            </Link>
          </Button>
        ) : closed ? (
          <Button variant="outline" size="sm" onClick={() => onAction(candidate.id, "review")}>
            <CheckCircle2 className="h-4 w-4" />
            Review
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => onAction(candidate.id, "dismiss")}>
              <XCircle className="h-4 w-4" />
              Dismiss
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAction(candidate.id, "duplicate")}>
              <CopyX className="h-4 w-4" />
              Duplicate
            </Button>
            <Button size="sm" onClick={() => onAction(candidate.id, "save")}>
              <CheckCircle2 className="h-4 w-4" />
              Save as deal
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function Meta({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface/40 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate font-medium", className)}>{value}</div>
    </div>
  );
}
