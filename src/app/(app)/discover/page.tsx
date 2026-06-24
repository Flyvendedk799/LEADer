import { PageHeader } from "@/components/shared/page-header";
import { LaneMissionControl } from "@/components/discovery/lane-mission-control";
import { requireOwnerId } from "@/lib/auth";
import { ensureDefaultDiscoveryLanes } from "@/lib/crm/lanes";
import { dismissInvalidNewLaneCandidates } from "@/lib/crm/lane-hygiene";
import { db } from "@/lib/db";
import { workspaceFromRoute } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams?: { mission?: string; run?: string; workspace?: string };
}) {
  const ownerId = await requireOwnerId();
  const initialMissionId = searchParams?.mission ?? searchParams?.run ?? null;
  const initialWorkspace = workspaceFromRoute("/discover", searchParams);
  await ensureDefaultDiscoveryLanes(ownerId);
  await dismissInvalidNewLaneCandidates(ownerId).catch(() => null);
  const [lanes, latestMission] = await Promise.all([
    db.discoveryLane.findMany({
      where: { ownerId, active: true },
      orderBy: { createdAt: "asc" },
    }),
    initialMissionId
      ? Promise.resolve(null)
      : db.discoveryMission.findFirst({
          where: { ownerId },
          orderBy: { startedAt: "desc" },
          select: { laneId: true },
        }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discovery mission control"
        description="Run focused acquisition lanes, inspect evidence, and promote candidates into deals."
      />
      <LaneMissionControl
        lanes={lanes}
        initialLaneId={latestMission?.laneId}
        initialMissionId={initialMissionId}
        initialWorkspace={initialWorkspace}
      />
    </div>
  );
}
