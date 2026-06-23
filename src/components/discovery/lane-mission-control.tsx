"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  CheckCircle2,
  Clock3,
  Link2,
  CopyX,
  Database,
  Eye,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  Radar,
  RefreshCw,
  RotateCw,
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
import { discoveryLiveQueueCancelMessage } from "@/lib/crm/discovery-logging";
import { discoveryMissionCanRerun, discoveryMissionRerunBlockedMessage } from "@/lib/crm/discovery-run-actions";
import type { Workspace } from "@/lib/types";
import { cn, formatBudget, formatDate, truncate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Provider = "auto" | "tavily" | "brave" | "serper" | "none";
type CandidateAction = "review" | "save" | "dismiss" | "duplicate";
type MissionAction = "CANCEL" | "RERUN" | "MOVE_UP" | "MOVE_DOWN" | "MOVE_TOP";

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
  hiddenReason?: string | null;
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
    workspace?: Workspace;
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
  hiddenCandidateCount?: number;
  hiddenCandidates?: Candidate[];
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
  workspace?: Workspace;
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

type DiscoveryQueueSnapshot = {
  activeMissionId: string | null;
  queuedMissionIds: string[];
};

type MissionListResponse = {
  missions?: MissionSummary[];
  queue?: Partial<DiscoveryQueueSnapshot>;
  canceled?: number;
  error?: string;
};

type MissionDetailResponse = MissionResult & {
  hiddenCandidateCount?: number;
  hiddenCandidates?: Candidate[];
  queue?: Partial<DiscoveryQueueSnapshot>;
  error?: string;
};

type MissionControlResponse = {
  mission?: Partial<MissionSummary> & { id: string; candidates?: Candidate[] };
  queue?: Partial<DiscoveryQueueSnapshot>;
  queued?: boolean;
  moved?: boolean;
  reason?: string | null;
  error?: string;
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

function normalizeQueue(queue?: Partial<DiscoveryQueueSnapshot> | null): DiscoveryQueueSnapshot {
  return {
    activeMissionId: typeof queue?.activeMissionId === "string" ? queue.activeMissionId : null,
    queuedMissionIds: Array.isArray(queue?.queuedMissionIds)
      ? queue.queuedMissionIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function missionQueueLabel(id: string, queue: DiscoveryQueueSnapshot) {
  if (queue.activeMissionId === id) return "active";
  const queuedIndex = queue.queuedMissionIds.indexOf(id);
  return queuedIndex >= 0 ? `queued #${queuedIndex + 1}` : null;
}

function sortMissionsWithQueue(items: MissionSummary[], queue: DiscoveryQueueSnapshot) {
  const queueIndex = new Map(queue.queuedMissionIds.map((id, index) => [id, index]));
  const rank = (mission: MissionSummary) => {
    if (queue.activeMissionId === mission.id) return -1;
    const index = queueIndex.get(mission.id);
    return index == null ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...items].sort((a, b) => {
    const rankA = rank(a);
    const rankB = rank(b);
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}

function apiMissionToSummary(mission: Partial<MissionSummary> & { id: string; candidates?: Candidate[] }): MissionSummary {
  return {
    id: mission.id,
    status: String(mission.status ?? "QUEUED"),
    workspace: mission.workspace,
    provider: mission.provider,
    startedAt: mission.startedAt ?? new Date().toISOString(),
    finishedAt: mission.finishedAt,
    query: String(mission.query ?? ""),
    lane: mission.lane,
    warnings: Array.isArray(mission.warnings) ? mission.warnings : [],
    log: Array.isArray(mission.log) ? mission.log : [],
    sourceScanCount: mission.sourceScanCount,
    _count: mission._count ?? { candidates: mission.candidates?.length ?? 0 },
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
  initialWorkspace = "DK",
}: {
  lanes: DiscoveryLane[];
  initialMissionId?: string | null;
  initialWorkspace?: Workspace;
}) {
  const router = useRouter();
  const initialMissionLoadedRef = React.useRef<string | null>(null);
  const [laneId, setLaneId] = React.useState(lanes[0]?.id ?? "");
  const [workspace, setWorkspace] = React.useState<Workspace>(initialWorkspace);
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
  const [queueState, setQueueState] = React.useState<DiscoveryQueueSnapshot>(() => normalizeQueue());
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);
  const [activeMissionId, setActiveMissionId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<MissionResult | null>(null);
  const [showHiddenCandidates, setShowHiddenCandidates] = React.useState(false);
  const [busyMissionAction, setBusyMissionAction] = React.useState<string | null>(null);
  const selectedLane = lanes.find((lane) => lane.id === laneId);
  const officialTenderMode =
    selectedLane?.slug === "tenders-procurement" &&
    workspace === "DK" &&
    provider === "auto" &&
    searchMode !== "wide";
  const effectiveIncludeSources = officialTenderMode ? false : includeSources;
  const candidates = result?.mission.candidates ?? [];
  const hiddenCandidateCount = result?.hiddenCandidateCount ?? 0;
  const hiddenCandidates = result?.hiddenCandidates ?? [];
  const missionStatus = result?.mission.status ?? "";
  const missionRunning = missionStatus === "QUEUED" || missionStatus === "RUNNING";
  const liveQueue =
    missionRunning ||
    missions.some((mission) => mission.status === "QUEUED" || mission.status === "RUNNING") ||
    Boolean(queueState.activeMissionId) ||
    queueState.queuedMissionIds.length > 0;
  const orderedMissions = React.useMemo(() => sortMissionsWithQueue(missions, queueState), [missions, queueState]);
  const activeQueueLabel = activeMissionId ? missionQueueLabel(activeMissionId, queueState) : null;
  const latestLog = result?.mission.log?.at(-1);
  const latestLogMessage = latestLog ? missionLogParts(latestLog).message : null;
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

  React.useEffect(() => {
    setWorkspace(initialWorkspace);
  }, [initialWorkspace]);

  React.useEffect(() => {
    if (officialTenderMode) setIncludeSources(false);
  }, [officialTenderMode]);

  const loadMission = React.useCallback(async (id: string, quiet = false, syncUrl = true, includeHidden = showHiddenCandidates) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch(`/api/discovery/runs/${id}${includeHidden ? "?includeHidden=1" : ""}`, { cache: "no-store" });
      const data = (await res.json()) as MissionDetailResponse;
      if (!res.ok) throw new Error(data?.error || "Could not load mission");
      setResult(data);
      setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
      setActiveMissionId(data.mission.id);
      if (data.mission.workspace) setWorkspace(data.mission.workspace);
      if (syncUrl) syncMissionUrl(data.mission.id);
      mergeMission({
        id: data.mission.id,
        status: data.mission.status,
        workspace: data.mission.workspace,
        provider: data.mission.provider,
        startedAt: data.mission.startedAt ?? new Date().toISOString(),
        finishedAt: data.mission.finishedAt,
        query: data.mission.query || "",
        lane: data.mission.lane,
        warnings: data.mission.warnings ?? [],
        log: data.mission.log ?? [],
        sourceScanCount: data.mission.sourceScanCount,
        _count: { candidates: data.mission.candidates?.length ?? 0 },
      });
    } catch (err) {
      if (!quiet) toast.error("Could not load mission", err instanceof Error ? err.message : "Try again");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [mergeMission, showHiddenCandidates, syncMissionUrl]);

  const loadMissions = React.useCallback(async (openLatest = false, quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch("/api/discovery/runs", { cache: "no-store" });
      const data = (await res.json()) as MissionListResponse;
      if (!res.ok) throw new Error(data?.error || "Could not load mission history");
      const loaded = (data.missions ?? []) as MissionSummary[];
      setMissions(loaded);
      setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
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
    if (!liveQueue) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadMissions(false, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [liveQueue, loadMissions]);

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
          workspace,
          query: query || undefined,
          freeformBrief: query || undefined,
          useAiPlanner,
          searchMode,
          requiredTerms: listFromInput(requiredTerms),
          excludedTerms: listFromInput(excludedTerms),
          provider,
          includeWeb,
          includeSources: effectiveIncludeSources,
          maxResults: Number(maxResults) || 16,
        }),
      });
      const data = (await res.json()) as MissionDetailResponse;
      if (!res.ok) throw new Error(data?.error || "Discovery failed");
      setResult(data);
      setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
      setActiveMissionId(data.mission.id);
      syncMissionUrl(data.mission.id);
      mergeMission({
        id: data.mission.id,
        status: data.mission.status,
        workspace: data.mission.workspace ?? workspace,
        provider: data.mission.provider,
        startedAt: data.mission.startedAt ?? new Date().toISOString(),
        finishedAt: data.mission.finishedAt,
        query: data.mission.query || "",
        lane: data.mission.lane,
        warnings: data.mission.warnings ?? [],
        log: data.mission.log ?? [],
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

  async function toggleHiddenCandidates() {
    const next = !showHiddenCandidates;
    setShowHiddenCandidates(next);
    if (activeMissionId) {
      await loadMission(activeMissionId, false, true, next);
    }
  }

  async function controlMission(mission: MissionSummary, action: MissionAction) {
    setBusyMissionAction(`${action}-${mission.id}`);
    try {
      const res = await fetch("/api/discovery/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mission.id, action }),
      });
      const data = (await res.json().catch(() => null)) as MissionControlResponse | null;
      if (!res.ok || !data?.mission) throw new Error(data?.error || "Discovery control failed");

      if (data.queue) setQueueState(normalizeQueue(data.queue));
      const summary = apiMissionToSummary(data.mission);
      mergeMission(summary);
      setLastUpdatedAt(new Date());

      if (action === "RERUN") {
        setActiveMissionId(summary.id);
        syncMissionUrl(summary.id);
        void loadMission(summary.id, true, false);
        toast.success("Discovery mission queued", queryPreview(summary.query));
      } else if (action === "CANCEL") {
        setResult((current) =>
          current?.mission.id === summary.id
            ? {
                ...current,
                mission: {
                  ...current.mission,
                  status: summary.status,
                  finishedAt: summary.finishedAt,
                  log: summary.log ?? current.mission.log,
                  warnings: summary.warnings ?? current.mission.warnings,
                },
              }
            : current,
        );
        toast.success("Discovery mission canceled", queryPreview(summary.query));
      } else {
        toast.success("Discovery priority updated", queryPreview(summary.query));
      }
      router.refresh();
    } catch (err) {
      toast.error("Discovery control failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyMissionAction(null);
    }
  }

  async function cancelLiveMissions() {
    setBusyMissionAction("CANCEL_ALL");
    try {
      const res = await fetch("/api/discovery/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL_ALL" }),
      });
      const data = (await res.json().catch(() => null)) as MissionListResponse | null;
      if (!res.ok || !data) throw new Error(data?.error || "Discovery control failed");

      const nextMissions = data.missions ?? [];
      setMissions(nextMissions);
      if (data.queue) setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
      if (activeMissionId) {
        const updatedActive = nextMissions.find((mission) => mission.id === activeMissionId);
        if (updatedActive) {
          setResult((current) =>
            current?.mission.id === updatedActive.id
              ? {
                  ...current,
                  mission: {
                    ...current.mission,
                    status: updatedActive.status,
                    finishedAt: updatedActive.finishedAt,
                    warnings: updatedActive.warnings ?? current.mission.warnings,
                    log: updatedActive.log ?? current.mission.log,
                  },
                }
              : current,
          );
        }
      }
      toast.success("Live discovery queue canceled", discoveryLiveQueueCancelMessage(data.canceled ?? 0));
      router.refresh();
    } catch (err) {
      toast.error("Discovery control failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyMissionAction(null);
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
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
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
                  <Label>Workspace</Label>
                  <Select value={workspace} onValueChange={(value) => setWorkspace(value as Workspace)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DK">Denmark</SelectItem>
                      <SelectItem value="GLOBAL">International</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <Switch
                  id="mission-sources"
                  checked={effectiveIncludeSources}
                  disabled={officialTenderMode}
                  onCheckedChange={setIncludeSources}
                />
              </div>
              <Button type="submit" disabled={loading || !laneId || (!includeWeb && !effectiveIncludeSources)} className="w-full">
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
                    {result.mission.workspace ? (
                      <Badge variant="outline">{result.mission.workspace === "GLOBAL" ? "International" : "Denmark"}</Badge>
                    ) : null}
                    {activeQueueLabel ? <Badge variant="secondary">{activeQueueLabel}</Badge> : null}
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
                  {latestLogMessage ? (
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{latestLogMessage}</p>
                  ) : null}
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
                  {hiddenCandidateCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleHiddenCandidates}
                      disabled={refreshing || !activeMissionId}
                    >
                      <Eye className="h-4 w-4" />
                      {showHiddenCandidates ? "Hide hidden" : `Hidden: ${hiddenCandidateCount}`}
                    </Button>
                  ) : null}
                  {["NEW", "REVIEWED", "SAVED", "DISMISSED", "DUPLICATE"].map((status) => (
                    counts[status] ? <Badge key={status} variant="outline">{status.toLowerCase()}: {counts[status]}</Badge> : null
                  ))}
                </div>
              </div>
            </div>

            {candidates.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {missionRunning ? "Mission running in background. It stays available in mission history." : "No candidates found for this mission."}
                </CardContent>
              </Card>
            ) : (
              candidates.map((candidate) => (
                <CandidateCard key={candidate.id} candidate={candidate} onAction={candidateAction} />
              ))
            )}

            {showHiddenCandidates && hiddenCandidates.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed border-border bg-surface/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Hidden candidates</p>
                  <Badge variant="outline">{hiddenCandidates.length}</Badge>
                </div>
                {hiddenCandidates.map((candidate) => (
                  <CandidateCard key={`hidden-${candidate.id}`} candidate={candidate} onAction={candidateAction} hidden />
                ))}
              </div>
            ) : null}
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
              {liveQueue ? (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Live queue
                </span>
              ) : lastUpdatedAt ? (
                <span className="text-xs font-normal text-muted-foreground">{missionTime(lastUpdatedAt)}</span>
              ) : null}
              {liveQueue ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={Boolean(busyMissionAction)}
                  onClick={cancelLiveMissions}
                >
                  {busyMissionAction === "CANCEL_ALL" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Cancel live
                </Button>
              ) : null}
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
            {orderedMissions.length ? (
              orderedMissions.map((mission) => {
                const queueLabel = missionQueueLabel(mission.id, queueState);
                const latestMissionLog = mission.log?.at(-1);
                const latestMissionLogMessage = latestMissionLog ? missionLogParts(latestMissionLog).message : null;
                const queuedIndex = queueState.queuedMissionIds.indexOf(mission.id);
                const moveable = mission.status === "QUEUED" && queuedIndex >= 0;
                const lastQueuedIndex = queueState.queuedMissionIds.length - 1;
                const cancelable = mission.status === "QUEUED" || mission.status === "RUNNING";
                const rerunnable = discoveryMissionCanRerun(mission.status);
                const rerunBlockedMessage = discoveryMissionRerunBlockedMessage(mission.status);
                return (
                  <div
                    key={mission.id}
                    className={cn(
                      "rounded-md border border-border bg-surface/40 p-2 transition hover:border-primary/40 hover:bg-surface",
                      activeMissionId === mission.id && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void loadMission(mission.id, false, true)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{mission.lane?.name ?? "Discovery mission"}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {queueLabel ? <Badge variant="secondary">{queueLabel}</Badge> : null}
                          {mission.workspace ? (
                            <Badge variant="outline">{mission.workspace === "GLOBAL" ? "International" : "Denmark"}</Badge>
                          ) : null}
                          <Badge variant={missionStatusVariant(mission.status)}>{mission.status.toLowerCase()}</Badge>
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{queryPreview(mission.query)}</p>
                      {latestMissionLogMessage ? (
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{latestMissionLogMessage}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {missionTime(mission.startedAt)}
                        </span>
                        <span>{missionDuration(mission.startedAt, mission.finishedAt)}</span>
                        <span>{missionCandidateCount(mission)} candidates</span>
                      </div>
                    </button>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-border pt-2">
                      {moveable ? (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            disabled={Boolean(busyMissionAction) || queuedIndex === 0}
                            onClick={() => controlMission(mission, "MOVE_TOP")}
                            aria-label="Move discovery mission to top"
                            title="Move discovery mission to top"
                          >
                            {busyMissionAction === `MOVE_TOP-${mission.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowUpToLine className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            disabled={Boolean(busyMissionAction) || queuedIndex === 0}
                            onClick={() => controlMission(mission, "MOVE_UP")}
                            aria-label="Move discovery mission up"
                            title="Move discovery mission up"
                          >
                            {busyMissionAction === `MOVE_UP-${mission.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowUp className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            disabled={Boolean(busyMissionAction) || queuedIndex === lastQueuedIndex}
                            onClick={() => controlMission(mission, "MOVE_DOWN")}
                            aria-label="Move discovery mission down"
                            title="Move discovery mission down"
                          >
                            {busyMissionAction === `MOVE_DOWN-${mission.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={Boolean(busyMissionAction) || !rerunnable}
                        onClick={() => controlMission(mission, "RERUN")}
                        aria-label={rerunBlockedMessage ?? "Rerun discovery mission"}
                        title={rerunBlockedMessage ?? "Rerun discovery mission"}
                      >
                        {busyMissionAction === `RERUN-${mission.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {cancelable ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={Boolean(busyMissionAction)}
                          onClick={() => controlMission(mission, "CANCEL")}
                          aria-label="Cancel discovery mission"
                          title="Cancel discovery mission"
                        >
                          {busyMissionAction === `CANCEL-${mission.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
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
  hidden = false,
}: {
  candidate: Candidate;
  onAction: (id: string, action: CandidateAction) => void;
  hidden?: boolean;
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
    <article
      id={`candidate-${candidate.id}`}
      className={cn(
        "scroll-mt-24 rounded-lg border border-border bg-card p-4 shadow-sm",
        hidden && "border-dashed bg-muted/30",
      )}
    >
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
            {candidate.hiddenReason ? <Badge variant="warning">{candidate.hiddenReason}</Badge> : null}
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

      {!hidden ? (
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
      ) : null}
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
