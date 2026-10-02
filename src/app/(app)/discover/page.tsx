import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { LaneMissionControl } from "@/components/discovery/lane-mission-control";
import { requireOwnerId } from "@/lib/auth";
import { ensureDefaultDiscoveryLanes } from "@/lib/crm/lanes";
import { dismissInvalidNewLaneCandidates } from "@/lib/crm/lane-hygiene";
import { discoveryProviderReadiness } from "@/lib/discovery";
import { AUTOMATABLE_SOURCE_TYPES } from "@/lib/types";
import { hasLlm } from "@/lib/ai/provider";
import { db } from "@/lib/db";
import { workspaceFromRoute } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function DiscoverPage(props: {
  searchParams?: Promise<{
    mission?: string;
    run?: string;
    workspace?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
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
          where: { ownerId, workspace: initialWorkspace },
          orderBy: { startedAt: "desc" },
          select: { laneId: true },
        }),
  ]);

  const user = await db.user.findUniqueOrThrow({
    where: { id: ownerId },
    select: { aiKeys: true },
  });
  const sourceCount = await db.source.count({
    where: {
      ownerId,
      workspace: initialWorkspace,
      enabled: true,
      url: { not: null },
      type: { in: AUTOMATABLE_SOURCE_TYPES },
    },
  });
  const readiness = {
    ...discoveryProviderReadiness(user.aiKeys),
    aiConfigured: hasLlm(user.aiKeys),
    sourceCount,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover your next opportunity"
        description="Choose the kind of work you want. Search public sources, check the evidence, and save promising leads."
      >
        <Button asChild variant="outline">
          <Link href={`/inbox?workspace=${initialWorkspace}`}>
            Review saved discoveries →
          </Link>
        </Button>
      </PageHeader>
      <LaneMissionControl
        readiness={readiness}
        lanes={lanes}
        initialLaneId={latestMission?.laneId}
        initialMissionId={initialMissionId}
        initialWorkspace={initialWorkspace}
      />
    </div>
  );
}
