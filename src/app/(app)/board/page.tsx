import Link from "next/link";
import { Columns3 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { OPPORTUNITY_INCLUDE } from "@/lib/opportunities";
import type { Workspace } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { PipelineBoard } from "@/components/board/pipeline-board";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Cap the board to a sane number of cards; deep backlogs live in the table view.
const BOARD_LIMIT = 300;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[]>;
}) {
  const ownerId = await requireOwnerId();
  const ws = searchParams.workspace;
  const workspace: Workspace = ws === "GLOBAL" ? "GLOBAL" : "DK";

  const items = await db.opportunity.findMany({
    where: { ownerId, workspace },
    orderBy: [{ priority: "desc" }, { matchScore: "desc" }],
    include: OPPORTUNITY_INCLUDE,
    take: BOARD_LIMIT,
  });

  const tab = (target: Workspace, label: string) => (
    <Link
      href={`/board?workspace=${target}`}
      className={cn(
        "rounded px-2.5 py-1 text-sm font-medium transition-colors",
        workspace === target
          ? target === "GLOBAL"
            ? "bg-accent/15 text-accent"
            : "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Pipeline board"
        description="Drag opportunities between stages to update their status."
      >
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
          {tab("DK", "🇩🇰 Denmark")}
          {tab("GLOBAL", "🌍 International")}
        </div>
        <Button asChild variant="outline">
          <Link href="/opportunities">Table view</Link>
        </Button>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No opportunities to triage"
          description={
            workspace === "GLOBAL"
              ? "No opportunities in your Global workspace yet."
              : "Add a source to start discovering opportunities, or create one manually."
          }
        >
          <Button asChild>
            <Link href="/opportunities">Go to opportunities</Link>
          </Button>
        </EmptyState>
      ) : (
        <PipelineBoard initial={items} />
      )}
    </div>
  );
}
