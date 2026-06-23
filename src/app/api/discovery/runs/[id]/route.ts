import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import {
  discoveryMissionDisplayWarnings,
  discoveryMissionProviderLabel,
  filterReviewableDiscoveryCandidates,
  hiddenDiscoveryCandidatesWarning,
} from "@/lib/crm/discovery-display";
import { visibleDiscoveryQueueSnapshotForOwner } from "@/lib/crm/discovery-queue";
import { dismissInvalidNewLaneCandidates } from "@/lib/crm/lane-hygiene";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwnerId();
    await dismissInvalidNewLaneCandidates(ownerId).catch(() => null);
    const mission = await db.discoveryMission.findFirst({
      where: { id: params.id, ownerId },
      include: {
        lane: true,
        candidates: {
          orderBy: [{ pursuitScore: "desc" }, { createdAt: "desc" }],
          include: { evidence: true, deal: true, account: true },
        },
      },
    });
    if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const visible = filterReviewableDiscoveryCandidates(mission.lane, mission.candidates);
    const baseWarnings = discoveryMissionDisplayWarnings(mission, mission.warnings);
    const hiddenWarning = hiddenDiscoveryCandidatesWarning(visible.removed, visible.reasons);
    const filteredMission = {
      ...mission,
      provider: discoveryMissionProviderLabel(mission),
      candidates: visible.candidates,
      warnings: hiddenWarning ? [...baseWarnings, hiddenWarning] : baseWarnings,
    };
    return NextResponse.json({ mission: filteredMission, queue: await visibleDiscoveryQueueSnapshotForOwner(ownerId) });
  } catch (err) {
    return apiError(err);
  }
}
