import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDiscoveryMission } from "@/lib/crm";
import { discoveryLogEntry, discoveryQueueLogMessage } from "@/lib/crm/discovery-logging";
import {
  discoveryQueueSnapshot,
  enqueueDiscoveryMission,
  isActiveDiscoveryMission,
  recoverDiscoveryQueue,
  removeQueuedDiscoveryMission,
  reorderQueuedDiscoveryMission,
  type DiscoveryQueueMoveAction,
} from "@/lib/crm/discovery-queue";
import { discoveryRunCreateSchema } from "@/lib/validators";

const discoveryRunActionSchema = z.object({
  id: z.string().min(1).optional(),
  action: z.enum(["CANCEL", "CANCEL_ALL", "RERUN", "MOVE_UP", "MOVE_DOWN", "MOVE_TOP"]),
});

const missionListInclude = {
  lane: true,
  _count: { select: { candidates: true } },
};

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const queue = await recoverDiscoveryQueue(ownerId);
    const missions = await db.discoveryMission.findMany({
      where: { ownerId },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: missionListInclude,
    });
    return NextResponse.json({ missions, queue });
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
        take: 20,
        include: missionListInclude,
      });
      return NextResponse.json({
        missions,
        queue: discoveryQueueSnapshot(ownerId),
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

      const moved = reorderQueuedDiscoveryMission(ownerId, source.id, parsed.data.action as DiscoveryQueueMoveAction);
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
      return NextResponse.json({ mission, queue: moved.queue, moved: moved.moved, reason: moved.reason });
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
      return NextResponse.json({ mission, queue: discoveryQueueSnapshot(ownerId) });
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
      { mission: queued ?? mission, queued: true, queue },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err);
  }
}
