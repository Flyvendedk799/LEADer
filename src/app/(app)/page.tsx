export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Activity,
  Banknote,
  CheckCircle2,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { requireOwnerId } from "@/lib/auth";
import { getDashboardMetrics } from "@/lib/dashboard";
import { formatBudget } from "@/lib/utils";
import { STATUS_META } from "@/lib/display";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreBadge } from "@/components/shared/score-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeadlinesPanel } from "@/components/dashboard/deadlines-panel";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";

export default async function DashboardPage() {
  const ownerId = await requireOwnerId();
  const metrics = await getDashboardMetrics(ownerId, "DK");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your Danish opportunity pipeline at a glance."
      />

      {/* Top row: headline metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="New leads"
          value={metrics.newLeads}
          accent="primary"
          icon={<Sparkles />}
        />
        <StatCard
          label="Active"
          value={metrics.activeLeads}
          accent="default"
          icon={<Activity />}
        />
        <StatCard
          label="Watchlist"
          value={metrics.watchlistCount}
          accent="warning"
          icon={<Star />}
        />
        <StatCard
          label="Applied"
          value={metrics.appliedCount}
          accent="default"
          icon={<TrendingUp />}
        />
        <StatCard
          label="Won / Lost"
          value={`${metrics.wonCount} / ${metrics.lostCount}`}
          accent="success"
          icon={<CheckCircle2 />}
        />
        <StatCard
          label="Pipeline value"
          value={formatBudget(null, metrics.pipelineValue, "DKK")}
          hint="Active, non-lost opportunities"
          accent="success"
          icon={<Banknote />}
        />
      </div>

      {/* Middle: deadlines + best matches */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DeadlinesPanel items={metrics.upcomingDeadlines} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Best matches</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.bestMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scored opportunities yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {metrics.bestMatches.map((m) => (
                  <li key={m.id} className="first:pt-0 last:pb-0 py-2.5">
                    <Link
                      href={`/opportunities/${m.id}`}
                      className="group flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">
                        {m.title}
                      </span>
                      <ScoreBadge score={m.matchScore} size="sm" showLabel />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom: breakdowns */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SourceBreakdown
          title="By source"
          data={metrics.bySource.map((s) => ({ label: s.source, value: s.count }))}
        />
        <SourceBreakdown
          title="By category"
          data={metrics.byCategory.map((c) => ({ label: c.category, value: c.count }))}
        />
        <SourceBreakdown
          title="By status"
          data={metrics.byStatus.map((s) => ({
            label: STATUS_META[s.status]?.label ?? s.status,
            value: s.count,
          }))}
        />
      </div>

      {metrics.newLeads === 0 &&
        metrics.activeLeads === 0 &&
        metrics.bySource.length === 0 && (
          <div className="mt-6">
            <EmptyState
              title="No opportunities yet"
              description="Add a source to start discovering Danish opportunities, or create one manually."
            />
          </div>
        )}
    </div>
  );
}