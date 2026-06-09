import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBadge } from "@/components/shared/score-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Gauge } from "lucide-react";
import type { ScoreBreakdown } from "@/lib/types";

export function ScoreBreakdown({ breakdown }: { breakdown: unknown }) {
  // Prisma returns scoreBreakdown as Json — cast to the typed shape.
  const data = breakdown as ScoreBreakdown | null | undefined;

  if (!data || !Array.isArray(data.components) || data.components.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-primary" />
            Score breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Gauge}
            title="Not scored yet"
            description="This opportunity has not been scored. Run discovery or trigger AI scoring to populate the breakdown."
          />
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(1, ...data.components.map((c) => c.contribution));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Gauge className="h-4 w-4 text-primary" />
          Score breakdown
        </CardTitle>
        <ScoreBadge score={data.total} size="lg" showLabel />
      </CardHeader>
      <CardContent className="space-y-3">
        {data.components.map((c) => {
          const pct = Math.round((c.contribution / max) * 100);
          return (
            <div key={c.criterion} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">{c.label}</span>
                <span className="tnum text-muted-foreground">+{c.contribution}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
