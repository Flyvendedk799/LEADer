import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import {
  CommunityImportForm,
  type CommunityImportRow,
} from "@/components/import/community-import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ownerId = await requireOwnerId();
  const rows = await db.communityImport.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      groupName: true,
      author: true,
      status: true,
      opportunityId: true,
      createdAt: true,
    },
  });
  const opportunityIds = rows.map((row) => row.opportunityId).filter((id): id is string => Boolean(id));
  const deals = opportunityIds.length
    ? await db.deal.findMany({
        where: { ownerId, legacyOpportunityId: { in: opportunityIds } },
        select: { id: true, legacyOpportunityId: true },
      })
    : [];
  const dealByOpportunity = new Map(deals.map((deal) => [deal.legacyOpportunityId, deal.id]));

  const recentImports: CommunityImportRow[] = rows.map((r) => ({
    ...r,
    dealId: r.opportunityId ? dealByOpportunity.get(r.opportunityId) ?? null : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Community import"
        description="Bring in leads from Facebook groups and communities — compliantly, by hand."
      />
      <CommunityImportForm recentImports={recentImports} />
    </div>
  );
}
