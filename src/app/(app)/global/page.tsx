export const dynamic = "force-dynamic";

import { Globe } from "lucide-react";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCockpit, listDeals } from "@/lib/crm";
import { DEAL_STATUS_META } from "@/lib/crm/status";
import { formatBudget } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeadlinesPanel } from "@/components/dashboard/deadlines-panel";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";
import { DealTable } from "@/components/crm/deal-table";

export default async function GlobalPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  const ownerId = await requireOwnerId();
  const q = typeof searchParams?.q === "string" ? searchParams.q : "";
  const params = new URLSearchParams({ workspace: "GLOBAL", pageSize: "25" });
  if (q) params.set("q", q);

  const [cockpit, listed, rows] = await Promise.all([
    getCockpit(ownerId, "GLOBAL"),
    listDeals(ownerId, params),
    db.deal.findMany({
      where: { ownerId, workspace: "GLOBAL" },
      select: { category: true, source: { select: { name: true } } },
    }),
  ]);

  const isEmpty = cockpit.openDeals + cockpit.wonDeals + cockpit.lostDeals === 0 && listed.total === 0 && !q;
  const byCategory = countLabels(rows.map((row) => row.category || "Uncategorised"));
  const bySource = countLabels(rows.map((row) => row.source?.name || "Manual"));

  return (
    <div>
      <PageHeader
        title="International deals"
        description="International pursuits, kept separate from your Danish pipeline."
      />

      {isEmpty ? (
        <EmptyState
          icon={Globe}
          title="No international deals yet"
          description="Save a discovery lead with the International workspace, or create a deal there, and it will collect here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Open" value={cockpit.openDeals} accent="primary" />
            <StatCard label="Won" value={cockpit.wonDeals} accent="success" />
            <StatCard label="Lost" value={cockpit.lostDeals} />
            <StatCard label="Overdue tasks" value={cockpit.overdueTasks.length} accent="warning" />
            <StatCard
              label="Pipeline value"
              value={formatBudget(null, cockpit.pipelineValue, "DKK")}
              hint="Open deals"
              accent="success"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DeadlinesPanel
                items={cockpit.upcomingDeadlines.flatMap((deal) =>
                  deal.deadline
                    ? [{
                        id: deal.id,
                        title: deal.title,
                        deadline: deal.deadline.toISOString(),
                        matchScore: deal.pursuitScore ?? deal.matchScore,
                      }]
                    : [],
                )}
              />
            </div>
            <SourceBreakdown
              title="By status"
              data={cockpit.byStatus.map((group) => ({
                label: DEAL_STATUS_META[group.status]?.label ?? group.status,
                value: group.count,
              }))}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SourceBreakdown title="By source" data={bySource} />
            <SourceBreakdown title="By category" data={byCategory} />
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              {q ? `International deals matching “${q}”` : "Top international deals"}
            </h2>
            <DealTable deals={listed.items} />
          </div>
        </>
      )}
    </div>
  );
}

function countLabels(labels: string[]) {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
