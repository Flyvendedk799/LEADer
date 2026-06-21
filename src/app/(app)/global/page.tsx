export const dynamic = "force-dynamic";

import { Globe } from "lucide-react";
import { requireOwnerId } from "@/lib/auth";
import { getDashboardMetrics } from "@/lib/dashboard";
import { listOpportunities } from "@/lib/opportunities";
import { formatBudget } from "@/lib/utils";
import { STATUS_META } from "@/lib/display";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeadlinesPanel } from "@/components/dashboard/deadlines-panel";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";
import { OpportunityTable } from "@/components/opportunities/opportunity-table";

export default async function GlobalPage() {
  const ownerId = await requireOwnerId();
  const [metrics, top] = await Promise.all([
    getDashboardMetrics(ownerId, "GLOBAL"),
    listOpportunities(ownerId, { workspace: "GLOBAL", sort: "score", pageSize: 25 }),
  ]);

  const isEmpty = top.total === 0 && metrics.activeLeads === 0 && metrics.newLeads === 0;

  return (
    <div>
      <PageHeader
        title="International opportunities"
        description="International tasks, kept separate from your Danish pipeline."
      />

      {isEmpty ? (
        <EmptyState
          icon={Globe}
          title="No global opportunities yet"
          description="Tag a source's workspace as GLOBAL, or set an opportunity's workspace to GLOBAL, and international tasks will collect here — separate from your Danish pipeline."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="New leads" value={metrics.newLeads} accent="primary" />
            <StatCard label="Active" value={metrics.activeLeads} />
            <StatCard label="Watchlist" value={metrics.watchlistCount} accent="warning" />
            <StatCard label="Applied" value={metrics.appliedCount} />
            <StatCard
              label="Won / Lost"
              value={`${metrics.wonCount} / ${metrics.lostCount}`}
              accent="success"
            />
            <StatCard
              label="Pipeline value"
              value={formatBudget(null, metrics.pipelineValue, "DKK")}
              hint="Active, non-lost opportunities"
              accent="success"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DeadlinesPanel items={metrics.upcomingDeadlines} />
            </div>
            <SourceBreakdown
              title="By status"
              data={metrics.byStatus.map((s) => ({
                label: STATUS_META[s.status]?.label ?? s.status,
                value: s.count,
              }))}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SourceBreakdown
              title="By source"
              data={metrics.bySource.map((s) => ({ label: s.source, value: s.count }))}
            />
            <SourceBreakdown
              title="By category"
              data={metrics.byCategory.map((c) => ({ label: c.category, value: c.count }))}
            />
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Top global opportunities
            </h2>
            <OpportunityTable items={top.items} />
          </div>
        </>
      )}
    </div>
  );
}
