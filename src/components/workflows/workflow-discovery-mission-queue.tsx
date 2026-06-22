"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Radar,
  RotateCw,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { discoveryMissionHref } from "@/lib/discovery-links";
import { discoveryLiveQueueCancelMessage } from "@/lib/crm/discovery-logging";
import { formatDate, truncate } from "@/lib/utils";

export type WorkflowDiscoveryMissionItem = {
  id: string;
  status: string;
  provider: string | null;
  startedAt: string;
  finishedAt: string | null;
  query: string;
  laneName: string;
  warnings: string[];
  log: string[];
  candidateCount: number;
};

type DiscoveryQueueSnapshot = {
  activeMissionId: string | null;
  queuedMissionIds: string[];
};

type ApiMission = Partial<WorkflowDiscoveryMissionItem> & {
  id: string;
  lane?: { name?: string | null } | null;
  _count?: { candidates?: number };
};

type MissionListResponse = {
  missions?: ApiMission[];
  queue?: Partial<DiscoveryQueueSnapshot>;
  canceled?: number;
  error?: string;
};

type MissionControlResponse = {
  mission?: ApiMission;
  queue?: Partial<DiscoveryQueueSnapshot>;
  error?: string;
};

type MissionAction = "CANCEL" | "CANCEL_ALL" | "RERUN" | "MOVE_UP" | "MOVE_DOWN" | "MOVE_TOP";

function statusVariant(status: string): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "SUCCESS") return "success";
  if (status === "ERROR") return "warning";
  if (status === "CANCELED") return "muted";
  if (status === "RUNNING" || status === "QUEUED") return "secondary";
  return "outline";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "ERROR") return <XCircle className="h-4 w-4 text-warning" />;
  if (status === "RUNNING") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "CANCELED") return <XCircle className="h-4 w-4 text-muted-foreground" />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" />;
}

function normalizeQueue(queue?: Partial<DiscoveryQueueSnapshot> | null): DiscoveryQueueSnapshot {
  return {
    activeMissionId: typeof queue?.activeMissionId === "string" ? queue.activeMissionId : null,
    queuedMissionIds: Array.isArray(queue?.queuedMissionIds)
      ? queue.queuedMissionIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function apiMissionToItem(mission: ApiMission): WorkflowDiscoveryMissionItem {
  return {
    id: mission.id,
    status: String(mission.status ?? "QUEUED"),
    provider: typeof mission.provider === "string" ? mission.provider : null,
    startedAt: mission.startedAt ? new Date(mission.startedAt).toISOString() : new Date().toISOString(),
    finishedAt: mission.finishedAt ? new Date(mission.finishedAt).toISOString() : null,
    query: String(mission.query ?? ""),
    laneName: mission.laneName ?? mission.lane?.name ?? "Discovery mission",
    warnings: Array.isArray(mission.warnings) ? mission.warnings.map(String) : [],
    log: Array.isArray(mission.log) ? mission.log.map(String) : [],
    candidateCount:
      typeof mission.candidateCount === "number"
        ? mission.candidateCount
        : typeof mission._count?.candidates === "number"
          ? mission._count.candidates
          : 0,
  };
}

function missionDuration(start?: string | null, end?: string | null) {
  if (!start) return "";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function firstQuery(value = "") {
  return value.split("\n").map((item) => item.trim()).filter(Boolean)[0] || "Discovery mission";
}

function sortMissionsWithQueue(items: WorkflowDiscoveryMissionItem[], queue: DiscoveryQueueSnapshot) {
  const queueIndex = new Map(queue.queuedMissionIds.map((id, index) => [id, index]));
  const rank = (mission: WorkflowDiscoveryMissionItem) => {
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

export function WorkflowDiscoveryMissionQueue({
  missions,
  queue = { activeMissionId: null, queuedMissionIds: [] },
}: {
  missions: WorkflowDiscoveryMissionItem[];
  queue?: DiscoveryQueueSnapshot;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(missions);
  const [queueState, setQueueState] = React.useState(() => normalizeQueue(queue));
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);
  const orderedItems = React.useMemo(() => sortMissionsWithQueue(items, queueState), [items, queueState]);

  React.useEffect(() => {
    setItems(missions);
  }, [missions]);

  React.useEffect(() => {
    setQueueState(normalizeQueue(queue));
  }, [queue]);

  const live = React.useMemo(
    () =>
      items.some((item) => item.status === "QUEUED" || item.status === "RUNNING") ||
      Boolean(queueState.activeMissionId) ||
      queueState.queuedMissionIds.length > 0,
    [items, queueState.activeMissionId, queueState.queuedMissionIds.length],
  );

  React.useEffect(() => {
    if (!live) return;
    let stopped = false;

    async function refreshMissions() {
      try {
        const res = await fetch("/api/discovery/runs", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as MissionListResponse | null;
        if (!res.ok || !data || stopped) return;
        if (Array.isArray(data.missions)) {
          setItems(data.missions.map(apiMissionToItem));
        }
        setQueueState(normalizeQueue(data.queue));
        setLastUpdatedAt(new Date());
      } catch {
        // Durable missions remain visible from the server snapshot; keep polling quiet.
      }
    }

    void refreshMissions();
    const timer = window.setInterval(refreshMissions, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [live]);

  async function controlMission(mission: WorkflowDiscoveryMissionItem, action: MissionAction) {
    setBusyId(`${action}-${mission.id}`);
    try {
      const res = await fetch("/api/discovery/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mission.id, action }),
      });
      const data = (await res.json().catch(() => null)) as MissionControlResponse | null;
      if (!res.ok || !data?.mission) throw new Error(data?.error || "Discovery control failed");

      if (data.queue) setQueueState(normalizeQueue(data.queue));
      const updated = apiMissionToItem(data.mission);
      if (action === "RERUN") {
        setItems((current) => [updated, ...current]);
        toast.success("Discovery mission queued", firstQuery(updated.query));
      } else if (action === "CANCEL") {
        setItems((current) => current.map((item) => (item.id === mission.id ? { ...item, ...updated } : item)));
        toast.success("Discovery mission canceled", firstQuery(mission.query));
      } else {
        setItems((current) => current.map((item) => (item.id === mission.id ? { ...item, ...updated } : item)));
        toast.success("Discovery priority updated", firstQuery(mission.query));
      }
      setLastUpdatedAt(new Date());
      router.refresh();
    } catch (err) {
      toast.error("Discovery control failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelLiveMissions() {
    setBusyId("CANCEL_ALL");
    try {
      const res = await fetch("/api/discovery/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL_ALL" }),
      });
      const data = (await res.json().catch(() => null)) as MissionListResponse | null;
      if (!res.ok || !data) throw new Error(data?.error || "Discovery control failed");

      if (Array.isArray(data.missions)) setItems(data.missions.map(apiMissionToItem));
      if (data.queue) setQueueState(normalizeQueue(data.queue));
      setLastUpdatedAt(new Date());
      toast.success("Live discovery queue canceled", discoveryLiveQueueCancelMessage(data.canceled ?? 0));
      router.refresh();
    } catch (err) {
      toast.error("Discovery control failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No discovery runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        {live ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Live queue
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={cancelLiveMissions}
            >
              {busyId === "CANCEL_ALL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancel live
            </Button>
          </div>
        ) : lastUpdatedAt ? (
          <span>Updated {formatDate(lastUpdatedAt.toISOString())}</span>
        ) : null}
      </div>
      {orderedItems.map((mission) => {
        const latestLog = mission.log.at(-1) ?? mission.warnings.at(0);
        const cancelable = mission.status === "QUEUED" || mission.status === "RUNNING";
        const cancelBusy = busyId === `CANCEL-${mission.id}`;
        const rerunBusy = busyId === `RERUN-${mission.id}`;
        const queuedIndex = queueState.queuedMissionIds.indexOf(mission.id);
        const moveable = mission.status === "QUEUED" && queuedIndex >= 0;
        const lastQueuedIndex = queueState.queuedMissionIds.length - 1;
        const queueLabel =
          queueState.activeMissionId === mission.id ? "active" : queuedIndex >= 0 ? `queued #${queuedIndex + 1}` : null;

        return (
          <div
            key={mission.id}
            className="grid gap-3 rounded-md border border-border bg-surface/40 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Link href={discoveryMissionHref(mission.id)} className="min-w-0 hover:text-primary">
              <div className="flex flex-wrap items-center gap-2">
                <StatusIcon status={mission.status} />
                <p className="truncate text-sm font-medium">{mission.laneName}</p>
                <Badge variant={statusVariant(mission.status)}>{mission.status.toLowerCase()}</Badge>
                {mission.provider ? <Badge variant="outline">{mission.provider}</Badge> : null}
                {queueLabel ? <Badge variant="secondary">{queueLabel}</Badge> : null}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{firstQuery(mission.query)}</p>
              {latestLog ? (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{truncate(latestLog, 150)}</p>
              ) : null}
            </Link>
            <div className="flex items-center justify-end gap-2">
              <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <Radar className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{missionDuration(mission.startedAt, mission.finishedAt)}</span>
                <span className="whitespace-nowrap">{mission.candidateCount} candidates</span>
              </div>
              {moveable ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={Boolean(busyId) || queuedIndex === 0}
                    onClick={() => controlMission(mission, "MOVE_TOP")}
                    aria-label="Move discovery mission to top"
                    title="Move discovery mission to top"
                  >
                    {busyId === `MOVE_TOP-${mission.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUpToLine className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={Boolean(busyId) || queuedIndex === 0}
                    onClick={() => controlMission(mission, "MOVE_UP")}
                    aria-label="Move discovery mission up"
                    title="Move discovery mission up"
                  >
                    {busyId === `MOVE_UP-${mission.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={Boolean(busyId) || queuedIndex === lastQueuedIndex}
                    onClick={() => controlMission(mission, "MOVE_DOWN")}
                    aria-label="Move discovery mission down"
                    title="Move discovery mission down"
                  >
                    {busyId === `MOVE_DOWN-${mission.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowDown className="h-4 w-4" />
                    )}
                  </Button>
                </>
              ) : null}
              <Button
                asChild
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label="Inspect discovery mission"
                title="Inspect discovery mission"
              >
                <Link href={discoveryMissionHref(mission.id)}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={Boolean(busyId)}
                onClick={() => controlMission(mission, "RERUN")}
                aria-label="Rerun discovery mission"
                title="Rerun discovery mission"
              >
                {rerunBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              </Button>
              {cancelable ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={Boolean(busyId)}
                  onClick={() => controlMission(mission, "CANCEL")}
                  aria-label="Cancel discovery mission"
                  title="Cancel discovery mission"
                >
                  {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
