"use client";
import {
  CandidateCard,
  RejectedCandidateRow,
  type Candidate,
  type CandidateAction,
} from "./candidate-card";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardPaste,
  AlertCircle,
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  Clock3,
  Link2,
  Database,
  Eye,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  discoveryCandidateHashId,
  discoveryRejectedAnchorKey,
  shouldLoadRejectedDiscoveryAnchor,
} from "@/lib/discovery-anchors";
import { discoveryMissionHref } from "@/lib/discovery-links";
import { discoveryLiveQueueCancelMessage } from "@/lib/crm/discovery-logging";
import {
  discoveryMissionCanRerun,
  discoveryMissionRerunBlockedMessage,
} from "@/lib/crm/discovery-run-actions";
import { nextHistoryLimit } from "@/lib/history-window";
import type { Workspace } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Provider = "auto" | "tavily" | "brave" | "serper" | "none";
type MissionAction = "CANCEL" | "RERUN" | "MOVE_UP" | "MOVE_DOWN" | "MOVE_TOP";
type HistoryScope = "current-lane" | "all";
export const DEFAULT_HISTORY_SCOPE: HistoryScope = "current-lane";

type MissionLaneSummary = { id: string; name: string; slug?: string | null };


type MissionResult = {
  mission: {
    id: string;
    status: string;
    workspace?: Workspace;
    provider?: string | null;
    startedAt?: string | Date;
    finishedAt?: string | Date | null;
    query?: string;
    lane?: MissionLaneSummary | null;
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

export type MissionSummary = {
  id: string;
  status: string;
  workspace?: Workspace;
  provider?: string | null;
  startedAt: string | Date;
  finishedAt?: string | Date | null;
  query: string;
  lane?: MissionLaneSummary | null;
  warnings: string[];
  log?: string[];
  sourceScanCount?: number;
  _count?: { candidates: number };
  hiddenCandidateCount?: number;
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
  existing?: boolean;
  queued?: boolean;
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

function missionHiddenCandidateCount(mission: MissionSummary) {
  return mission.hiddenCandidateCount ?? 0;
}

function missionCandidateSummary(mission: MissionSummary) {
  const reviewable = missionCandidateCount(mission);
  const hidden = missionHiddenCandidateCount(mission);
  if (!reviewable && hidden) {
    return mission.lane?.slug === "tenders-procurement"
      ? `0 active tenders · ${hidden} rejected diagnostics`
      : `0 reviewable · ${hidden} rejected diagnostics`;
  }
  if (mission.lane?.slug === "tenders-procurement") {
    return hidden
      ? `${reviewable} active tenders · ${hidden} rejected diagnostics`
      : `${reviewable} active tenders`;
  }
  return hidden
    ? `${reviewable} reviewable · ${hidden} rejected`
    : `${reviewable} reviewable`;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

type MissionTenderQualitySummaryInput = Pick<
  MissionSummary,
  | "lane"
  | "provider"
  | "warnings"
  | "log"
  | "_count"
  | "hiddenCandidateCount"
  | "status"
>;

export function missionTenderQualitySummary(
  mission: MissionTenderQualitySummaryInput,
) {
  if (mission.lane?.slug !== "tenders-procurement") return null;
  const reviewable = mission._count?.candidates ?? 0;
  const rejected = mission.hiddenCandidateCount ?? 0;
  const logText = [...(mission.log ?? []), ...(mission.warnings ?? [])].join(
    " ",
  );
  const official =
    mission.provider === "udbud.dk" ||
    mission.provider === "udbud.dk+brave" ||
    /udbud\.dk returned|official udbud\.dk active notices/i.test(logText);
  const qualityLine = (mission.warnings ?? []).find((warning) =>
    /(?:lane guard|quality gate) rejected/i.test(warning),
  );

  if (reviewable > 0) {
    return `${plural(reviewable, "active tender")} ready for review${rejected ? ` · ${plural(rejected, "rejected diagnostic")}` : ""}${official ? " · official udbud.dk" : ""}.`;
  }
  if (rejected > 0) {
    return `0 active tenders ready. ${plural(rejected, "non-tender/off-scope result")} rejected by tender quality gates.${qualityLine ? ` ${qualityLine}` : ""}`;
  }
  if (mission.status === "SUCCESS" && official) {
    return "No active software tender notices survived the official udbud.dk filters.";
  }
  if (official) return "Searching official udbud.dk active notices.";
  return null;
}

export function missionHistorySearchSummary(count: number) {
  return `${count} matching ${count === 1 ? "mission" : "missions"} loaded`;
}

function missionStatusVariant(
  status: string,
): React.ComponentProps<typeof Badge>["variant"] {
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

function normalizeQueue(
  queue?: Partial<DiscoveryQueueSnapshot> | null,
): DiscoveryQueueSnapshot {
  return {
    activeMissionId:
      typeof queue?.activeMissionId === "string" ? queue.activeMissionId : null,
    queuedMissionIds: Array.isArray(queue?.queuedMissionIds)
      ? queue.queuedMissionIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
  };
}

function missionQueueLabel(id: string, queue: DiscoveryQueueSnapshot) {
  if (queue.activeMissionId === id) return "active";
  const queuedIndex = queue.queuedMissionIds.indexOf(id);
  return queuedIndex >= 0 ? `queued #${queuedIndex + 1}` : null;
}

function sortMissionsWithQueue(
  items: MissionSummary[],
  queue: DiscoveryQueueSnapshot,
) {
  const queueIndex = new Map(
    queue.queuedMissionIds.map((id, index) => [id, index]),
  );
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

export function mergeMissionHistory(
  items: MissionSummary[],
  mission: MissionSummary,
  limit: number,
) {
  return [mission, ...items.filter((item) => item.id !== mission.id)]
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    .slice(0, Math.max(1, limit));
}

function apiMissionToSummary(
  mission: Partial<MissionSummary> & { id: string; candidates?: Candidate[] },
): MissionSummary {
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
    hiddenCandidateCount: mission.hiddenCandidateCount ?? 0,
  };
}

function queryPreview(value?: string) {
  return (
    (value || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)[0] || "Discovery mission"
  );
}

function missionHistorySearchText(mission: MissionSummary) {
  return [
    mission.id,
    mission.status,
    mission.workspace,
    mission.provider,
    mission.lane?.name,
    mission.query,
    missionCandidateSummary(mission),
    ...(mission.warnings ?? []),
    ...(mission.log ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function missionMatchesHistorySearch(mission: MissionSummary, search: string) {
  const terms = search
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return true;
  const haystack = missionHistorySearchText(mission);
  return terms.every((term) => haystack.includes(term));
}

export function missionMatchesHistoryScope(
  mission: Pick<MissionSummary, "lane">,
  selectedLaneId: string | null | undefined,
  scope: HistoryScope,
) {
  if (scope === "all" || !selectedLaneId) return true;
  return mission.lane?.id === selectedLaneId;
}

export function selectMissionToOpen(
  missions: MissionSummary[],
  selectedLaneId: string | null | undefined,
  scope: HistoryScope,
) {
  return (
    missions.find((mission) =>
      missionMatchesHistoryScope(mission, selectedLaneId, scope),
    ) ??
    missions[0] ??
    null
  );
}

export function LaneMissionControl({
  lanes,
  initialLaneId,
  initialMissionId,
  initialWorkspace = "DK",
  readiness,
}: {
  readiness?: {
    searchConfigured: boolean;
    searchProvider: string;
    aiConfigured: boolean;
    sourceCount: number;
  };
  lanes: DiscoveryLane[];
  initialLaneId?: string | null;
  initialMissionId?: string | null;
  initialWorkspace?: Workspace;
}) {
  const router = useRouter();
  const initialMissionLoadedRef = React.useRef<string | null | undefined>(
    undefined,
  );
  const hiddenAnchorLoadRef = React.useRef<string | null>(null);
  const [laneId, setLaneId] = React.useState(() =>
    initialLaneId && lanes.some((lane) => lane.id === initialLaneId)
      ? initialLaneId
      : (lanes.find((lane) => lane.slug === "funded-work")?.id ??
        lanes[0]?.id ??
        ""),
  );
  const [workspace, setWorkspace] = React.useState<Workspace>(initialWorkspace);
  const [query, setQuery] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>("auto");
  const [searchMode, setSearchMode] = React.useState<SearchMode>("balanced");
  const [useAiPlanner, setUseAiPlanner] = React.useState(
    readiness?.aiConfigured ?? false,
  );
  const [requiredTerms, setRequiredTerms] = React.useState("");
  const [excludedTerms, setExcludedTerms] = React.useState("");
  const [maxResults, setMaxResults] = React.useState("16");
  const [includeWeb, setIncludeWeb] = React.useState(true);
  const [includeSources, setIncludeSources] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [missions, setMissions] = React.useState<MissionSummary[]>([]);
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyScope, setHistoryScope] = React.useState<HistoryScope>(
    DEFAULT_HISTORY_SCOPE,
  );
  const [historyLimit, setHistoryLimit] = React.useState(20);
  const [queueState, setQueueState] = React.useState<DiscoveryQueueSnapshot>(
    () => normalizeQueue(),
  );
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);
  const [activeMissionId, setActiveMissionId] = React.useState<string | null>(
    null,
  );
  const [result, setResult] = React.useState<MissionResult | null>(null);
  const [showHiddenCandidates, setShowHiddenCandidates] = React.useState(false);
  const [showDuplicates, setShowDuplicates] = React.useState(false);
  const [mode, setMode] = React.useState<"search" | "paste">("search");
  const [view, setView] = React.useState<"leads" | "runs">("leads");
  const [pasteText, setPasteText] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = React.useState(false);
  const [busyMissionAction, setBusyMissionAction] = React.useState<
    string | null
  >(null);
  const selectedLane = lanes.find((lane) => lane.id === laneId);
  const officialTenderMode =
    selectedLane?.slug === "tenders-procurement" &&
    workspace === "DK" &&
    provider === "auto";
  const effectiveIncludeSources = officialTenderMode ? false : includeSources;
  const allCandidates = result?.mission.candidates ?? [];
  const duplicateCount = allCandidates.filter(
    (candidate) => candidate.status === "DUPLICATE",
  ).length;
  const candidates = showDuplicates
    ? allCandidates
    : allCandidates.filter((candidate) => candidate.status !== "DUPLICATE");
  const hiddenCandidateCount = result?.hiddenCandidateCount ?? 0;
  const hiddenCandidates = result?.hiddenCandidates ?? [];
  const missionStatus = result?.mission.status ?? "";
  const missionRunning =
    missionStatus === "QUEUED" || missionStatus === "RUNNING";
  const liveQueue =
    missionRunning ||
    missions.some(
      (mission) => mission.status === "QUEUED" || mission.status === "RUNNING",
    ) ||
    Boolean(queueState.activeMissionId) ||
    queueState.queuedMissionIds.length > 0;
  const orderedMissions = React.useMemo(
    () => sortMissionsWithQueue(missions, queueState),
    [missions, queueState],
  );
  const scopedMissions = React.useMemo(
    () =>
      orderedMissions.filter((mission) =>
        missionMatchesHistoryScope(mission, laneId, historyScope),
      ),
    [historyScope, laneId, orderedMissions],
  );
  const filteredMissions = React.useMemo(
    () =>
      scopedMissions.filter((mission) =>
        missionMatchesHistorySearch(mission, historySearch),
      ),
    [historySearch, scopedMissions],
  );
  const canLoadOlderMissions =
    missions.length >= historyLimit && historyLimit < 100;
  const historySearchActive = historySearch.trim().length > 0;
  const activeQueueLabel = activeMissionId
    ? missionQueueLabel(activeMissionId, queueState)
    : null;
  const latestLog = result?.mission.log?.at(-1);
  const latestLogMessage = latestLog
    ? missionLogParts(latestLog).message
    : null;
  const tenderQualitySummary = result
    ? missionTenderQualitySummary({
        lane: result.mission.lane,
        provider: result.mission.provider,
        warnings: result.mission.warnings,
        log: result.mission.log,
        _count: { candidates: candidates.length },
        hiddenCandidateCount,
        status: result.mission.status,
      })
    : null;
  const counts = candidates.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.status] = (acc[candidate.status] ?? 0) + 1;
    return acc;
  }, {});

  const mergeMission = React.useCallback(
    (mission: MissionSummary) => {
      setMissions((current) => {
        return mergeMissionHistory(current, mission, historyLimit);
      });
    },
    [historyLimit],
  );

  const syncMissionUrl = React.useCallback(
    (id: string, missionWorkspace = workspace) => {
      const next = new URL(discoveryMissionHref(id), window.location.origin);
      next.searchParams.set("workspace", missionWorkspace);
      window.history.replaceState(
        window.history.state,
        "",
        next.pathname + next.search,
      );
    },
    [workspace],
  );

  const syncLaneFromMission = React.useCallback(
    (mission?: { lane?: MissionLaneSummary | null }) => {
      const missionLaneId = mission?.lane?.id;
      if (missionLaneId && lanes.some((lane) => lane.id === missionLaneId)) {
        setLaneId(missionLaneId);
      }
    },
    [lanes],
  );

  React.useEffect(() => {
    setWorkspace(initialWorkspace);
  }, [initialWorkspace]);

  React.useEffect(() => {
    if (initialLaneId && lanes.some((lane) => lane.id === initialLaneId)) {
      setLaneId(initialLaneId);
    }
  }, [initialLaneId, lanes]);

  React.useEffect(() => {
    if (officialTenderMode) setIncludeSources(false);
  }, [officialTenderMode]);

  const loadMission = React.useCallback(
    async (
      id: string,
      quiet = false,
      syncUrl = true,
      includeHidden = false,
    ) => {
      if (!quiet) {
        setRefreshing(true);
        setView("leads");
      }
      try {
        const res = await fetch(
          `/api/discovery/runs/${id}${includeHidden ? "?includeHidden=1" : ""}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as MissionDetailResponse;
        if (!res.ok) throw new Error(data?.error || "Could not load mission");
        if (!includeHidden) setShowHiddenCandidates(false);
        setResult(data);
        syncLaneFromMission(data.mission);
        setQueueState(normalizeQueue(data.queue));
        setLastUpdatedAt(new Date());
        setActiveMissionId(data.mission.id);
        if (data.mission.workspace) setWorkspace(data.mission.workspace);
        if (syncUrl) syncMissionUrl(data.mission.id, data.mission.workspace);
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
          hiddenCandidateCount: data.hiddenCandidateCount ?? 0,
        });
      } catch (err) {
        if (!quiet)
          toast.error(
            "Could not load mission",
            err instanceof Error ? err.message : "Try again",
          );
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [mergeMission, syncLaneFromMission, syncMissionUrl],
  );

  const loadMissions = React.useCallback(
    async (
      openLatest = false,
      quiet = false,
      limitOverride?: number,
      searchOverride = historySearch,
      scopeOverride = historyScope,
    ) => {
      if (!quiet) setRefreshing(true);
      try {
        const limit = limitOverride ?? historyLimit;
        const params = new URLSearchParams({ limit: String(limit), workspace });
        const search = searchOverride.trim();
        if (search) {
          params.set("q", search);
          params.set("scope", scopeOverride);
          if (scopeOverride === "current-lane" && laneId)
            params.set("laneId", laneId);
        }
        const res = await fetch(`/api/discovery/runs?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as MissionListResponse;
        if (!res.ok)
          throw new Error(data?.error || "Could not load mission history");
        const loaded = (data.missions ?? []) as MissionSummary[];
        setMissions(loaded);
        setQueueState(normalizeQueue(data.queue));
        setLastUpdatedAt(new Date());
        const missionToOpen = openLatest
          ? selectMissionToOpen(loaded, laneId, historyScope)
          : null;
        if (missionToOpen) {
          void loadMission(missionToOpen.id, true, false);
        }
      } catch (err) {
        if (!quiet)
          toast.error(
            "Could not load missions",
            err instanceof Error ? err.message : "Try again",
          );
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [historyLimit, historyScope, historySearch, laneId, loadMission, workspace],
  );

  const loadOlderMissions = React.useCallback(() => {
    const nextLimit = nextHistoryLimit(historyLimit, historySearchActive);
    setHistoryLimit(nextLimit);
    void loadMissions(false, false, nextLimit, historySearch, historyScope);
  }, [
    historyLimit,
    historySearch,
    historySearchActive,
    historyScope,
    loadMissions,
  ]);

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
    const hashId = discoveryCandidateHashId(window.location.hash);
    if (!hashId) return;
    const target = document.getElementById(hashId);
    if (target) {
      hiddenAnchorLoadRef.current = null;
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start" });
      });
      return;
    }

    if (
      shouldLoadRejectedDiscoveryAnchor({
        activeMissionId,
        hashId,
        rejectedCandidateCount: hiddenCandidateCount,
        rejectedResultsOpen: showHiddenCandidates,
        attemptedKey: hiddenAnchorLoadRef.current,
      }) &&
      activeMissionId
    ) {
      hiddenAnchorLoadRef.current = discoveryRejectedAnchorKey(
        activeMissionId,
        hashId,
      );
      setShowHiddenCandidates(true);
      void loadMission(activeMissionId, true, false, true);
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(hashId)?.scrollIntoView({ block: "start" });
    });
  }, [
    activeMissionId,
    hiddenCandidateCount,
    loadMission,
    result,
    showHiddenCandidates,
  ]);

  React.useEffect(() => {
    if (!activeMissionId || !missionRunning) return undefined;
    const timer = window.setInterval(() => {
      void loadMission(activeMissionId, true, true, showHiddenCandidates);
      void loadMissions(false, true);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [
    activeMissionId,
    loadMission,
    loadMissions,
    missionRunning,
    showHiddenCandidates,
  ]);

  React.useEffect(() => {
    if (!historySearchActive) return undefined;
    const timer = window.setTimeout(() => {
      const nextLimit = nextHistoryLimit(historyLimit, true);
      if (nextLimit !== historyLimit) setHistoryLimit(nextLimit);
      void loadMissions(false, true, nextLimit, historySearch, historyScope);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    historyLimit,
    historyScope,
    historySearch,
    historySearchActive,
    laneId,
    loadMissions,
  ]);

  React.useEffect(() => {
    if (!liveQueue) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadMissions(false, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [liveQueue, loadMissions]);

  async function importPasted(e: React.FormEvent) {
    e.preventDefault();
    if (!laneId || importing) return;
    setImporting(true);
    try {
      const res = await fetch("/api/discover/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laneId, workspace, text: pasteText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Could not import that text",
        );
      }
      setPasteText("");
      setShowDuplicates(false);
      toast.success(
        `Added ${data.created} new ${data.created === 1 ? "lead" : "leads"}`,
        data.duplicates ? `${data.duplicates} were already in your queue` : undefined,
      );
      await loadMission(data.missionId);
      window.dispatchEvent(new Event("leader:counts-refresh"));
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setImporting(false);
    }
  }

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
      setView("leads");
      syncLaneFromMission(data.mission);
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
        hiddenCandidateCount: data.hiddenCandidateCount ?? 0,
      });
      toast.success(
        data.existing
          ? "Discovery mission already active"
          : "Discovery mission queued",
        data.existing ? "Opening the active background mission." : undefined,
      );
    } catch (err) {
      toast.error(
        "Discovery failed",
        err instanceof Error ? err.message : "Could not run the lane",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyActiveMissionLink() {
    if (!activeMissionId) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${discoveryMissionHref(activeMissionId)}`,
      );
      toast.success("Mission link copied");
    } catch {
      toast.error(
        "Could not copy link",
        "Your browser blocked clipboard access.",
      );
    }
  }

  async function toggleHiddenCandidates() {
    const next = !showHiddenCandidates;
    setShowHiddenCandidates(next);
    if (activeMissionId) {
      await loadMission(activeMissionId, false, true, next);
    }
  }

  async function controlMission(
    mission: MissionSummary,
    action: MissionAction,
  ) {
    setBusyMissionAction(`${action}-${mission.id}`);
    try {
      const res = await fetch("/api/discovery/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mission.id, action }),
      });
      const data = (await res
        .json()
        .catch(() => null)) as MissionControlResponse | null;
      if (!res.ok || !data?.mission)
        throw new Error(data?.error || "Discovery control failed");

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
        toast.success(
          "Discovery mission canceled",
          queryPreview(summary.query),
        );
      } else {
        toast.success(
          "Discovery priority updated",
          queryPreview(summary.query),
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(
        "Discovery control failed",
        err instanceof Error ? err.message : "Try again",
      );
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
        body: JSON.stringify({ action: "CANCEL_ALL", limit: historyLimit }),
      });
      const data = (await res
        .json()
        .catch(() => null)) as MissionListResponse | null;
      if (!res.ok || !data)
        throw new Error(data?.error || "Discovery control failed");

      const nextMissions = data.missions ?? [];
      setMissions(nextMissions);
      if (data.queue) setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
      if (activeMissionId) {
        const updatedActive = nextMissions.find(
          (mission) => mission.id === activeMissionId,
        );
        if (updatedActive) {
          setResult((current) =>
            current?.mission.id === updatedActive.id
              ? {
                  ...current,
                  mission: {
                    ...current.mission,
                    status: updatedActive.status,
                    finishedAt: updatedActive.finishedAt,
                    warnings:
                      updatedActive.warnings ?? current.mission.warnings,
                    log: updatedActive.log ?? current.mission.log,
                  },
                }
              : current,
          );
        }
      }
      toast.success(
        "Live discovery queue canceled",
        discoveryLiveQueueCancelMessage(data.canceled ?? 0),
      );
      router.refresh();
    } catch (err) {
      toast.error(
        "Discovery control failed",
        err instanceof Error ? err.message : "Try again",
      );
    } finally {
      setBusyMissionAction(null);
    }
  }

  async function candidateAction(id: string, action: CandidateAction) {
    try {
      const res = await fetch(`/api/discovery/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "dismiss" ? "Not a fit right now" : undefined,
        }),
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
      window.dispatchEvent(new Event("leader:counts-refresh"));
      router.refresh();
    } catch (err) {
      toast.error(
        "Action failed",
        err instanceof Error ? err.message : "Try again",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex rounded-lg border border-border bg-card p-1"
            role="tablist"
            aria-label="How to add leads"
          >
            {(
              [
                ["search", "Search for leads"],
                ["paste", "Paste from ChatGPT or notes"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {readiness && (
            <p className="text-xs text-muted-foreground">
              Web search:{" "}
              <span className={readiness.searchConfigured ? "" : "font-medium text-warning"}>
                {readiness.searchConfigured ? readiness.searchProvider : "not connected"}
              </span>
              {" · "}AI: {readiness.aiConfigured ? "connected" : "off"}
              {" · "}
              {readiness.sourceCount} sources in {initialWorkspace}
            </p>
          )}
        </div>
        {readiness && !readiness.searchConfigured && mode === "search" && (
          <p className="rounded-md border border-border bg-surface/40 p-3 text-sm leading-6">
            Without a web search key, searches only reach udbud.dk tenders and your saved
            sources. Add Tavily, Brave or Serper for open-web results, or{" "}
            <button
              type="button"
              className="font-medium text-primary underline underline-offset-4"
              onClick={() => setMode("paste")}
            >
              paste what you found elsewhere
            </button>
            .{" "}
            <Link
              href="/settings?tab=ai"
              className="font-medium text-primary underline underline-offset-4"
            >
              Set up search
            </Link>
          </p>
        )}
        {mode === "paste" && (
          <form
            onSubmit={importPasted}
            className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]">
              <div className="space-y-2">
                <Label>Type of work</Label>
                <Select value={laneId} onValueChange={setLaneId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose lane" />
                  </SelectTrigger>
                  <SelectContent>
                    {lanes.map((lane) => (
                      <SelectItem key={lane.id} value={lane.id}>
                        {lane.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="block pt-2">Region</Label>
                <Select
                  value={workspace}
                  onValueChange={(value) => setWorkspace(value as Workspace)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DK">Denmark</SelectItem>
                    <SelectItem value="GLOBAL">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paste-leads">Paste the answer, list or notes</Label>
                <Textarea
                  id="paste-leads"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste what ChatGPT (or anything else) gave you: companies, tenders, links. Leader pulls out each lead, scores it, and checks it against what you already have."
                  className="min-h-48 resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  Links are kept exactly as written and nothing is invented. Check each source
                  before contacting a buyer.
                </p>
              </div>
            </div>
            <Button type="submit" disabled={importing || !laneId || pasteText.trim().length < 10}>
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardPaste className="h-4 w-4" />
              )}
              Add to review queue
            </Button>
          </form>
        )}
        {mode === "search" && (
        <form
          onSubmit={runMission}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <div className="grid gap-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]">
              <div className="space-y-2">
                <Label>Type of work</Label>
                <Select value={laneId} onValueChange={setLaneId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose lane" />
                  </SelectTrigger>
                  <SelectContent>
                    {lanes.map((lane) => (
                      <SelectItem key={lane.id} value={lane.id}>
                        {lane.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLane?.slug === "community-manual" ||
                selectedLane?.slug === "warm-network" ? (
                  <p className="rounded-md bg-muted p-3 text-sm leading-6">
                    Private conversations need your context.{" "}
                    <Link href="/import" className="text-primary underline">
                      Import a conversation
                    </Link>{" "}
                    or{" "}
                    <Link
                      href={`/deals?workspace=${workspace}&new=1`}
                      className="text-primary underline"
                    >
                      add a known lead
                    </Link>
                    . Web search below only finds public signals.
                  </p>
                ) : null}
                {selectedLane && (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {selectedLane.description}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mission-focus">What are you looking for?</Label>
                <Textarea
                  id="mission-focus"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Describe the lead shape in plain language, e.g. AI automation for Danish SMEs with reporting pain"
                  className="min-h-28 resize-y"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <p>
                {officialTenderMode
                  ? "Searches the official Danish tender index."
                  : [
                      includeWeb ? "web" : null,
                      effectiveIncludeSources ? "your sources" : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")
                      .replace(/^./, (c) => c.toUpperCase()) || "Nothing selected"}
                {" · "}
                {workspace === "GLOBAL" ? "International" : "Denmark"} · up to {maxResults} leads
              </p>
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-4"
                onClick={() =>
                  setQuery(
                    selectedLane?.slug === "tenders-procurement"
                      ? "Active Danish software tenders with a clear buyer, future deadline and scope suitable for a solo developer."
                      : "Danish SMEs seeking a software partner for reporting automation or internal tools. Prefer a named buyer, concrete need and a project under 250,000 DKK. Exclude job listings and generic agency pages.",
                  )
                }
              >
                Use an example brief
              </button>
            </div>
            <Button
              type="submit"
              disabled={
                loading ||
                !laneId ||
                (!includeWeb && !effectiveIncludeSources)
              }
              className="justify-self-start sm:min-w-48"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Find leads
            </Button>
            <div className="space-y-3 rounded-md border border-border bg-surface/40 p-3">
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="flex w-full items-center justify-between gap-2 text-sm font-medium hover:text-primary transition-colors"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  Search options
                </span>
                {showAdvancedOptions ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </button>

              {showAdvancedOptions && (
                <div className="grid gap-4 pt-2 sm:grid-cols-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Provider</Label>
                      <Select
                        value={provider}
                        onValueChange={(value) =>
                          setProvider(value as Provider)
                        }
                      >
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
                      <Select
                        value={workspace}
                        onValueChange={(value) =>
                          setWorkspace(value as Workspace)
                        }
                      >
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
                      <Select
                        value={searchMode}
                        onValueChange={(value) =>
                          setSearchMode(value as SearchMode)
                        }
                      >
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
                    <Label
                      htmlFor="mission-ai"
                      className="flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      AI freeform planner
                    </Label>
                    <Switch
                      id="mission-ai"
                      checked={useAiPlanner}
                      disabled={readiness?.aiConfigured === false}
                      onCheckedChange={setUseAiPlanner}
                    />
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
                    <Label
                      htmlFor="mission-web"
                      className="flex items-center gap-2"
                    >
                      <Globe2 className="h-4 w-4" />
                      Web
                    </Label>
                    <Switch
                      id="mission-web"
                      checked={includeWeb}
                      onCheckedChange={setIncludeWeb}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor="mission-sources"
                      className="flex items-center gap-2"
                    >
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
                </div>
              )}
            </div>
          </div>
        </form>
        )}

        <div className="flex items-center gap-1 border-b border-border" role="tablist" aria-label="Results or runs">
          {(
            [
              ["leads", "Leads"],
              ["runs", "Runs & history"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                view === value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {value === "leads" && result ? (
                <Badge variant="secondary">{candidates.length}</Badge>
              ) : null}
              {value === "runs" && liveQueue ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : null}
            </button>
          ))}
        </div>

        {view === "leads" && !result && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No run open yet. Search for leads above, paste research, or open an earlier run from Runs &amp; history.
          </p>
        )}
        {view === "leads" && result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {missionRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : null}
                    {result.mission.lane?.name ?? "Discovery mission"}
                    <Badge
                      variant={missionStatusVariant(result.mission.status)}
                    >
                      {result.mission.status.toLowerCase()}
                    </Badge>
                    {result.mission.workspace ? (
                      <Badge variant="outline">
                        {result.mission.workspace === "GLOBAL"
                          ? "International"
                          : "Denmark"}
                      </Badge>
                    ) : null}
                    {!candidates.length && hiddenCandidateCount > 0 ? (
                      <Badge variant="warning">all rejected</Badge>
                    ) : null}
                    {activeQueueLabel ? (
                      <Badge variant="secondary">{activeQueueLabel}</Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {candidates.length} reviewable{" "}
                    {candidates.length === 1 ? "candidate" : "candidates"}
                    {hiddenCandidateCount > 0
                      ? ` · ${hiddenCandidateCount} rejected`
                      : ""}
                    {" · "}
                    {result.mission.provider || "web"} search
                    {" · "}
                    {result.mission.sourceScanCount ?? 0} sources scanned
                    {" · "}
                    {missionDuration(
                      result.mission.startedAt,
                      result.mission.finishedAt,
                    )}
                  </p>
                  {latestLogMessage ? (
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {latestLogMessage}
                    </p>
                  ) : null}
                  {tenderQualitySummary ? (
                    <p className="mt-1 text-xs font-medium text-foreground">
                      {tenderQualitySummary}
                    </p>
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
                  {duplicateCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDuplicates((value) => !value)}
                    >
                      <Eye className="h-4 w-4" />
                      {showDuplicates
                        ? "Hide already-found"
                        : `Already in queue: ${duplicateCount}`}
                    </Button>
                  ) : null}
                  {hiddenCandidateCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleHiddenCandidates}
                      disabled={refreshing || !activeMissionId}
                    >
                      <Eye className="h-4 w-4" />
                      {showHiddenCandidates
                        ? "Hide diagnostics"
                        : `Diagnostics: ${hiddenCandidateCount}`}
                    </Button>
                  ) : null}
                  {["NEW", "REVIEWED", "SAVED", "DISMISSED", "DUPLICATE"].map(
                    (status) =>
                      counts[status] ? (
                        <Badge key={status} variant="outline">
                          {status.toLowerCase()}: {counts[status]}
                        </Badge>
                      ) : null,
                  )}
                </div>
              </div>
            </div>

            {candidates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                  <p>
                    {missionRunning
                      ? "Mission running in background. It stays available in mission history."
                      : duplicateCount > 0 && !showDuplicates
                        ? `Nothing new this time: all ${duplicateCount} results were already in your queue. Try a different brief, add a web search key, or paste research from elsewhere.`
                      : hiddenCandidateCount > 0
                        ? `${hiddenCandidateCount} results were filtered out by the lane quality gate.`
                        : (tenderQualitySummary ??
                          "No candidates found for this mission.")}
                  </p>
                  {!missionRunning && hiddenCandidateCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!showHiddenCandidates)
                          void toggleHiddenCandidates();
                      }}
                      disabled={refreshing || !activeMissionId}
                    >
                      <Eye className="h-4 w-4" />
                      Inspect rejection diagnostics
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  onAction={candidateAction}
                />
              ))
            )}

            {showHiddenCandidates && hiddenCandidates.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed border-warning/50 bg-warning/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Rejection diagnostics</p>
                    <p className="text-xs text-muted-foreground">
                      Filtered rows are kept for audit only; they are not
                      reviewable discoveries.
                    </p>
                  </div>
                  <Badge variant="warning">{hiddenCandidates.length}</Badge>
                </div>
                {hiddenCandidates.map((candidate) => (
                  <RejectedCandidateRow
                    key={`hidden-${candidate.id}`}
                    candidate={candidate}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {view === "runs" && (
      <aside className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card className="lg:col-span-2">
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
                <span className="text-xs font-normal text-muted-foreground">
                  {missionTime(lastUpdatedAt)}
                </span>
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
                <RefreshCw
                  className={cn("h-4 w-4", refreshing && "animate-spin")}
                />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background/50 p-1">
                <Button
                  type="button"
                  variant={
                    historyScope === "current-lane" ? "secondary" : "ghost"
                  }
                  size="sm"
                  className="h-8"
                  onClick={() => setHistoryScope("current-lane")}
                  disabled={!laneId}
                >
                  Current lane
                </Button>
                <Button
                  type="button"
                  variant={historyScope === "all" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setHistoryScope("all")}
                >
                  All lanes
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Find old mission"
                  className="pr-9 pl-8"
                />
                {historySearchActive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setHistorySearch("")}
                    aria-label="Clear mission history search"
                    title="Clear"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {historySearchActive
                  ? missionHistorySearchSummary(filteredMissions.length)
                  : historyScope === "current-lane" && selectedLane
                    ? `${scopedMissions.length} ${selectedLane.name} missions loaded`
                    : `${pluralize(scopedMissions.length, "mission")} loaded`}
              </p>
            </div>

            {filteredMissions.length ? (
              filteredMissions.map((mission) => {
                const queueLabel = missionQueueLabel(mission.id, queueState);
                const latestMissionLog = mission.log?.at(-1);
                const latestMissionLogMessage = latestMissionLog
                  ? missionLogParts(latestMissionLog).message
                  : null;
                const missionQualitySummary =
                  missionTenderQualitySummary(mission);
                const queuedIndex = queueState.queuedMissionIds.indexOf(
                  mission.id,
                );
                const moveable =
                  mission.status === "QUEUED" && queuedIndex >= 0;
                const lastQueuedIndex = queueState.queuedMissionIds.length - 1;
                const cancelable =
                  mission.status === "QUEUED" || mission.status === "RUNNING";
                const rerunnable = discoveryMissionCanRerun(mission.status);
                const rerunBlockedMessage = discoveryMissionRerunBlockedMessage(
                  mission.status,
                );
                return (
                  <div
                    key={mission.id}
                    className={cn(
                      "rounded-md border border-border bg-surface/40 p-2 transition hover:border-primary/40 hover:bg-surface",
                      activeMissionId === mission.id &&
                        "border-primary/50 bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void loadMission(mission.id, false, true)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {mission.lane?.name ?? "Discovery mission"}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {queueLabel ? (
                            <Badge variant="secondary">{queueLabel}</Badge>
                          ) : null}
                          {mission.workspace ? (
                            <Badge variant="outline">
                              {mission.workspace === "GLOBAL"
                                ? "International"
                                : "Denmark"}
                            </Badge>
                          ) : null}
                          <Badge variant={missionStatusVariant(mission.status)}>
                            {mission.status.toLowerCase()}
                          </Badge>
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {queryPreview(mission.query)}
                      </p>
                      {latestMissionLogMessage ? (
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {latestMissionLogMessage}
                        </p>
                      ) : null}
                      {missionQualitySummary ? (
                        <p className="mt-1 truncate text-[11px] font-medium text-foreground">
                          {missionQualitySummary}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {missionTime(mission.startedAt)}
                        </span>
                        <span>
                          {missionDuration(
                            mission.startedAt,
                            mission.finishedAt,
                          )}
                        </span>
                        <span>{missionCandidateSummary(mission)}</span>
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
                            disabled={
                              Boolean(busyMissionAction) || queuedIndex === 0
                            }
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
                            disabled={
                              Boolean(busyMissionAction) || queuedIndex === 0
                            }
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
                            disabled={
                              Boolean(busyMissionAction) ||
                              queuedIndex === lastQueuedIndex
                            }
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
                        aria-label={
                          rerunBlockedMessage ?? "Rerun discovery mission"
                        }
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
              <p className="py-3 text-sm text-muted-foreground">
                {historySearchActive
                  ? "No missions match this search."
                  : "No missions yet."}
              </p>
            )}
            {canLoadOlderMissions ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={refreshing}
                onClick={loadOlderMissions}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <History className="h-4 w-4" />
                )}
                {historySearchActive
                  ? "Search older missions"
                  : "Load older missions"}
              </Button>
            ) : null}
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
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Evidence
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLane.evidenceRequirements.map((item) => (
                      <Badge
                        key={item}
                        variant="outline"
                        className="max-w-full truncate"
                        title={item}
                      >
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Positive signals
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLane.positiveKeywords.slice(0, 9).map((item) => (
                      <Badge
                        key={item}
                        variant="secondary"
                        className="max-w-full truncate"
                        title={item}
                      >
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Conversion angle
                  </p>
                  <p className="leading-6 text-muted-foreground">
                    {selectedLane.conversionGuidance}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                Choose a lane to inspect its playbook.
              </p>
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
              <p className="leading-6 text-muted-foreground">
                {result.plan.summary}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">
                  {result.plan.confidence}% confidence
                </Badge>
                {result.plan.requiredTerms.map((term) => (
                  <Badge key={`required-${term}`} variant="secondary">
                    must: {term}
                  </Badge>
                ))}
                {result.plan.excludedTerms.map((term) => (
                  <Badge key={`exclude-${term}`} variant="warning">
                    avoid: {term}
                  </Badge>
                ))}
              </div>
              {result.plan.notes.length ? (
                <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                  {result.plan.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
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
                  <li
                    key={generatedQuery}
                    className="rounded-md bg-surface/70 p-2 leading-5"
                  >
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
                {result.mission.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
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
                    <li
                      key={`${entry}-${index}`}
                      className="rounded-md bg-surface/70 p-2 leading-5"
                    >
                      {item.time ? (
                        <span className="mr-2 font-medium text-foreground">
                          {item.time}
                        </span>
                      ) : null}
                      <span>{item.message}</span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </aside>
      )}
    </div>
  );
}
