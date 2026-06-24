import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDiscoveryMission } from "@/lib/crm";
import {
  discoveryMissionDisplayWarnings,
  discoveryMissionProviderLabel,
  filterReviewableDiscoveryCandidates,
  hiddenDiscoveryCandidatesWarning,
} from "@/lib/crm/discovery-display";
import { dismissInvalidNewLaneCandidates } from "@/lib/crm/lane-hygiene";
import { discoveryLogEntry, discoveryQueueLogMessage } from "@/lib/crm/discovery-logging";
import { type CandidateLike, type LaneLike } from "@/lib/crm/lanes";
import { discoveryMissionInputMatchesActiveRun, discoveryMissionRerunBlockedMessage } from "@/lib/crm/discovery-run-actions";
import {
  discoveryQueueSnapshot,
  enqueueDiscoveryMission,
  isActiveDiscoveryMission,
  recoverDiscoveryQueue,
  removeQueuedDiscoveryMission,
  reorderQueuedDiscoveryMission,
  visibleDiscoveryQueueSnapshotForOwner,
  type DiscoveryQueueMoveAction,
} from "@/lib/crm/discovery-queue";
import { discoveryRunCreateSchema } from "@/lib/validators";

const discoveryRunActionSchema = z.object({
  id: z.string().min(1).optional(),
  action: z.enum(["CANCEL", "CANCEL_ALL", "RERUN", "MOVE_UP", "MOVE_DOWN", "MOVE_TOP"]),
  limit: z.coerce.number().int().min(20).max(100).optional(),
});

function discoveryHistoryLimit(req: Request) {
  const raw = new URL(req.url).searchParams.get("limit");
  const parsed = raw ? Number(raw) : 20;
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(100, Math.max(20, Math.floor(parsed)));
}

function discoveryHistorySearch(req: Request) {
  return (new URL(req.url).searchParams.get("q") || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function discoveryHistoryLaneScope(req: Request) {
  const params = new URL(req.url).searchParams;
  const scope = params.get("scope") === "current-lane" ? "current-lane" : "all";
  const laneId = (params.get("laneId") || "").trim();
  return { scope, laneId };
}

function discoveryHistorySearchText(mission: {
  id: string;
  status?: string | null;
  workspace?: string | null;
  provider?: string | null;
  query?: string | null;
  lane?: LaneLike | null;
  warnings?: string[];
  log?: string[];
  candidates?: CandidateLike[];
}) {
  const reviewableCandidates = filterReviewableDiscoveryCandidates(
    mission.lane,
    mission.candidates ?? [],
  ).candidates;
  return [
    mission.id,
    mission.status,
    mission.workspace,
    mission.provider,
    mission.query,
    mission.lane?.name,
    mission.lane?.slug,
    ...(mission.warnings ?? []),
    ...(mission.log ?? []),
    ...reviewableCandidates.flatMap((candidate) => [
      candidate.title,
      candidate.description,
      candidate.rawContent,
      candidate.url,
      candidate.organization,
      candidate.sourceName,
      candidate.sourceKind,
      candidate.category,
      candidate.status,
      candidate.applicationRoute,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function discoveryMissionMatchesHistorySearch(mission: Parameters<typeof discoveryHistorySearchText>[0], search: string) {
  const terms = search
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return true;
  const haystack = discoveryHistorySearchText(mission);
  return terms.every((term) => haystack.includes(term));
}

const candidateGateSelect = {
  title: true,
  description: true,
  rawContent: true,
  url: true,
  organization: true,
  sourceName: true,
  sourceKind: true,
  category: true,
  budgetMin: true,
  budgetMax: true,
  deadline: true,
  status: true,
  applicationRoute: true,
} satisfies Partial<Record<keyof CandidateLike, true>>;

const missionListInclude = {
  lane: true,
  candidates: {
    select: candidateGateSelect,
  },
  _count: { select: { candidates: true } },
};

const missionDetailInclude = {
  lane: true,
  candidates: {
    include: { evidence: true, deal: true, account: true },
    orderBy: [{ pursuitScore: "desc" as const }, { createdAt: "desc" as const }],
  },
};

function visibleMissionListRow<T extends {
  lane: LaneLike | null;
  candidates: CandidateLike[];
  provider?: string | null;
  log?: string[];
  warnings: string[];
  _count: { candidates: number };
}>(mission: T) {
  const { candidates, ...rest } = mission;
  const visible = filterReviewableDiscoveryCandidates(mission.lane, candidates);
  const baseWarnings = discoveryMissionDisplayWarnings(mission, rest.warnings);
  const hiddenWarning = hiddenDiscoveryCandidatesWarning(visible.removed, visible.reasons);
  return {
    ...rest,
    provider: discoveryMissionProviderLabel(mission),
    hiddenCandidateCount: visible.removed,
    warnings: hiddenWarning ? [...baseWarnings, hiddenWarning] : baseWarnings,
    _count: {
      ...rest._count,
      candidates: visible.candidates.length,
    },
  };
}

function visibleMissionDetail<T extends {
  lane: LaneLike | null;
  candidates: (CandidateLike & { status?: string | null })[];
  provider?: string | null;
  log?: string[];
  warnings: string[];
}>(mission: T) {
  const visible = filterReviewableDiscoveryCandidates(mission.lane, mission.candidates);
  const baseWarnings = discoveryMissionDisplayWarnings(mission, mission.warnings);
  const hiddenWarning = hiddenDiscoveryCandidatesWarning(visible.removed, visible.reasons);
  return {
    ...mission,
    provider: discoveryMissionProviderLabel(mission),
    candidates: visible.candidates,
    warnings: hiddenWarning ? [...baseWarnings, hiddenWarning] : baseWarnings,
    hiddenCandidateCount: visible.removed,
  };
}

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    await dismissInvalidNewLaneCandidates(ownerId).catch(() => null);
    const queue = await recoverDiscoveryQueue(ownerId);
    const search = discoveryHistorySearch(req);
    const { scope, laneId } = discoveryHistoryLaneScope(req);
    const limit = discoveryHistoryLimit(req);
    const take = search ? 100 : limit;
    const missions = await db.discoveryMission.findMany({
      where: {
        ownerId,
        ...(search && scope === "current-lane" && laneId ? { laneId } : {}),
      },
      orderBy: { startedAt: "desc" },
      take,
      include: missionListInclude,
    });
    const filtered = search
      ? missions.filter((mission) => discoveryMissionMatchesHistorySearch(mission, search)).slice(0, limit)
      : missions;
    return NextResponse.json({ missions: filtered.map(visibleMissionListRow), queue });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = discoveryRunCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const queueBeforeCreate = await recoverDiscoveryQueue(ownerId);
    const activeMissions = await db.discoveryMission.findMany({
      where: { ownerId, status: { in: ["QUEUED", "RUNNING"] }, finishedAt: null },
      select: { id: true, status: true, finishedAt: true, workspace: true, input: true },
      orderBy: [{ queuePriority: "desc" }, { startedAt: "asc" }],
      take: 50,
    });
    const existing = activeMissions.find((mission) => discoveryMissionInputMatchesActiveRun(parsed.data, mission));
    if (existing) {
      const mission = await db.discoveryMission.findFirst({
        where: { id: existing.id, ownerId },
        include: missionDetailInclude,
      });
      const visibleMission = mission ? visibleMissionDetail(mission) : mission;
      return NextResponse.json({
        mission: visibleMission,
        hiddenCandidateCount: visibleMission?.hiddenCandidateCount ?? 0,
        queued: false,
        existing: true,
        queue: queueBeforeCreate,
      });
    }

    const mission = await createDiscoveryMission(ownerId, parsed.data, "QUEUED");
    enqueueDiscoveryMission(ownerId, mission.id, parsed.data);
    const queue = discoveryQueueSnapshot(ownerId);
    await db.discoveryMission.update({
      where: { id: mission.id },
      data: { log: { push: discoveryLogEntry(discoveryQueueLogMessage(mission.id, queue)) } },
    }).catch(() => {});
    return NextResponse.json({ mission, queued: true, queue }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = await req.json().catch(() => ({}));
    const parsed = discoveryRunActionSchema.safeParse(body ?? {});
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    if (parsed.data.action === "CANCEL_ALL") {
      const liveMissions = await db.discoveryMission.findMany({
        where: { ownerId, status: { in: ["QUEUED", "RUNNING"] } },
        include: missionListInclude,
        orderBy: { startedAt: "desc" },
      });
      const now = new Date();
      await Promise.all(
        liveMissions.map((mission) => {
          const removed = removeQueuedDiscoveryMission(ownerId, mission.id);
          const active = isActiveDiscoveryMission(ownerId, mission.id);
          return db.discoveryMission.update({
            where: { id: mission.id },
            include: missionListInclude,
            data: {
              status: "CANCELED",
              finishedAt: now,
              log: {
                push: discoveryLogEntry(
                  active && !removed
                    ? "Bulk cancel requested while worker was running; results will be discarded when the current phase returns."
                    : "Bulk canceled before worker started.",
                ),
              },
            },
          });
        }),
      );
      const missions = await db.discoveryMission.findMany({
        where: { ownerId },
        orderBy: { startedAt: "desc" },
        take: parsed.data.limit ?? 20,
        include: missionListInclude,
      });
      return NextResponse.json({
        missions: missions.map(visibleMissionListRow),
        queue: await visibleDiscoveryQueueSnapshotForOwner(ownerId),
        canceled: liveMissions.length,
      });
    }

    await recoverDiscoveryQueue(ownerId);
    if (!parsed.data.id) {
      return NextResponse.json({ error: "Discovery mission id is required" }, { status: 400 });
    }
    const source = await db.discoveryMission.findFirst({ where: { id: parsed.data.id, ownerId } });
    if (!source) return NextResponse.json({ error: "Discovery mission not found" }, { status: 404 });

    if (parsed.data.action.startsWith("MOVE_")) {
      if (source.status !== "QUEUED" || isActiveDiscoveryMission(ownerId, source.id)) {
        return NextResponse.json({ error: "Only waiting queued discovery missions can be moved" }, { status: 409 });
      }

      const moved = await reorderQueuedDiscoveryMission(ownerId, source.id, parsed.data.action as DiscoveryQueueMoveAction);
      if (moved.reason === "not_queued") {
        return NextResponse.json({ error: "Discovery mission is not waiting in the queue" }, { status: 409 });
      }
      if (moved.moved) {
        await db.discoveryMission.update({
          where: { id: source.id },
          data: { log: { push: discoveryLogEntry("Queue priority updated.") } },
        });
      }

      const mission = await db.discoveryMission.findFirst({
        where: { id: source.id, ownerId },
        include: missionListInclude,
      });
      return NextResponse.json({
        mission: mission ? visibleMissionListRow(mission) : mission,
        queue: moved.queue,
        moved: moved.moved,
        reason: moved.reason,
      });
    }

    if (parsed.data.action === "CANCEL") {
      if (!["QUEUED", "RUNNING"].includes(source.status)) {
        return NextResponse.json({ error: "Only queued or running discovery missions can be canceled" }, { status: 409 });
      }
      const removed = removeQueuedDiscoveryMission(ownerId, source.id);
      const active = isActiveDiscoveryMission(ownerId, source.id);
      const mission = await db.discoveryMission.update({
        where: { id: source.id },
        include: missionListInclude,
        data: {
          status: "CANCELED",
          finishedAt: new Date(),
          log: {
            push: discoveryLogEntry(
              active && !removed
                ? "Cancel requested while worker was running; results will be discarded when the current phase returns."
                : "Canceled before worker started.",
            ),
          },
        },
      });
      return NextResponse.json({
        mission: visibleMissionListRow(mission),
        queue: await visibleDiscoveryQueueSnapshotForOwner(ownerId),
      });
    }

    const rerunBlockedMessage = discoveryMissionRerunBlockedMessage(source.status);
    if (rerunBlockedMessage) {
      return NextResponse.json({ error: rerunBlockedMessage }, { status: 409 });
    }

    const input = discoveryRunCreateSchema.safeParse(source.input ?? {
      laneId: source.laneId,
      query: source.query,
      workspace: source.workspace,
      provider: source.provider ?? "auto",
    });
    if (!input.success) {
      return NextResponse.json({ error: "Discovery mission input is missing or invalid" }, { status: 400 });
    }

    const mission = await createDiscoveryMission(ownerId, input.data, "QUEUED");
    await db.discoveryMission.update({
      where: { id: mission.id },
      data: { log: { push: discoveryLogEntry(`Rerun requested from ${source.id}.`) } },
    });
    enqueueDiscoveryMission(ownerId, mission.id, input.data);
    const queue = discoveryQueueSnapshot(ownerId);
    await db.discoveryMission.update({
      where: { id: mission.id },
      data: { log: { push: discoveryLogEntry(discoveryQueueLogMessage(mission.id, queue)) } },
    }).catch(() => {});
    const queued = await db.discoveryMission.findFirst({
      where: { id: mission.id, ownerId },
      include: missionListInclude,
    });
    return NextResponse.json(
      { mission: queued ? visibleMissionListRow(queued) : mission, queued: true, queue },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err);
  }
}
