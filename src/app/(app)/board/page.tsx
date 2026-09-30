import Link from "next/link";
import { Columns3 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import type { DealStatus, Workspace } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { PipelineBoard } from "@/components/board/pipeline-board";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BOARD_LIMIT = 300;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[]>;
}) {
  const ownerId = await requireOwnerId();
  const ws = searchParams.workspace;
  const workspace: Workspace = ws === "GLOBAL" ? "GLOBAL" : "DK";

  const items = await db.deal.findMany({
    where: { ownerId, workspace },
    orderBy: [{ priority: "desc" }, { pursuitScore: "desc" }],
    include: { account: { select: { name: true } } },
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
        description="Drag deals between stages to update their status."
      >
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
          {tab("DK", "🇩🇰 Denmark")}
          {tab("GLOBAL", "🌍 International")}
        </div>
        <Button asChild variant="outline">
          <Link href={`/deals?workspace=${workspace}`}>Table view</Link>
        </Button>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No deals to triage"
          description={
            workspace === "GLOBAL"
              ? "No deals in your International workspace yet."
              : "Discover a lead or create a deal to start the board."
          }
        >
          <Button asChild>
            <Link href={`/deals?workspace=${workspace}`}>Go to deals</Link>
          </Button>
        </EmptyState>
      ) : (
        <PipelineBoard
          initial={items.map((deal) => ({
            id: deal.id,
            title: deal.title,
            status: deal.status as DealStatus,
            valueMin: deal.valueMin,
            valueMax: deal.valueMax,
            currency: deal.currency,
            deadline: deal.deadline,
            pursuitScore: deal.pursuitScore,
            account: deal.account,
          }))}
        />
      )}
    </div>
  );
}
