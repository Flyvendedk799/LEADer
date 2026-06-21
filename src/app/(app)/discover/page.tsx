import { PageHeader } from "@/components/shared/page-header";
import { LaneMissionControl } from "@/components/discovery/lane-mission-control";
import { requireOwnerId } from "@/lib/auth";
import { ensureDefaultDiscoveryLanes } from "@/lib/crm/lanes";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams?: { mission?: string; run?: string };
}) {
  const ownerId = await requireOwnerId();
  const initialMissionId = searchParams?.mission ?? searchParams?.run ?? null;
  await ensureDefaultDiscoveryLanes(ownerId);
  const lanes = await db.discoveryLane.findMany({
    where: { ownerId, active: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discovery mission control"
        description="Run focused acquisition lanes, inspect evidence, and promote candidates into deals."
      />
      <LaneMissionControl lanes={lanes} initialMissionId={initialMissionId} />
    </div>
  );
}
