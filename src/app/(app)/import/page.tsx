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

  const recentImports: CommunityImportRow[] = rows.map((r) => ({
    ...r,
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
