import { Radar, Rss, ClipboardPaste } from "lucide-react";

import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SourceForm, type SourceRow } from "@/components/sources/source-form";
import { SourceTable } from "@/components/sources/source-table";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const ownerId = await requireOwnerId();
  const sources = (await db.source.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { opportunities: true } } },
  })) as unknown as SourceRow[];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Sources"
        description="Public sources are monitored automatically; community sources are manual-only."
      >
        <SourceForm />
      </PageHeader>

      {/* Two ingestion lanes — see docs/COMPLIANCE.md */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <div className="rounded-md bg-primary/15 p-2 text-primary">
            <Rss className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Automated public lane</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Public websites, RSS, procurement portals, accelerators, newsletters and APIs are
              fetched on a schedule (or on demand via &ldquo;Run now&rdquo;), then deduped, enriched
              and scored.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <div className="rounded-md bg-muted p-2 text-muted-foreground">
            <ClipboardPaste className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Manual / community lane</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Facebook &amp; community, uploads and manual entries are never auto-fetched. Bring them
              in by hand via Community Import — see{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">docs/COMPLIANCE.md</code>.
            </p>
          </div>
        </div>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No sources yet"
          description="Add a public source to start automated discovery, or add a manual source for the community-import lane."
        >
          <SourceForm />
        </EmptyState>
      ) : (
        <SourceTable sources={sources} />
      )}
    </div>
  );
}
