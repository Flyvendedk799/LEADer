import Link from "next/link";
import { Building2, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { ScoreBadge } from "@/components/shared/score-badge";
import { formatBudget, truncate } from "@/lib/utils";
import type { OpportunityListItem } from "@/lib/opportunities";

export function OpportunityCard({ opportunity: o }: { opportunity: OpportunityListItem }) {
  const summary = o.aiSummary || o.description || "";
  return (
    <Card className="flex flex-col transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">
            <Link href={`/opportunities/${o.id}`} className="hover:text-primary hover:underline">
              {o.title}
            </Link>
          </CardTitle>
          <ScoreBadge score={o.matchScore} size="sm" />
        </div>
        {o.organization && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {o.organization}
            {o.source?.name ? ` · ${o.source.name}` : ""}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          <DeadlinePill deadline={o.deadline} />
        </div>
        {summary && (
          <p className="text-sm text-muted-foreground">{truncate(summary, 180)}</p>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <div className="tnum flex items-center gap-1.5 text-sm text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          {formatBudget(o.budgetMin, o.budgetMax, o.currency ?? "DKK")}
        </div>
      </CardFooter>
    </Card>
  );
}
