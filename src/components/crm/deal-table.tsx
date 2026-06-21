import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { ScoreBadge } from "@/components/shared/score-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { DealStatusBadge } from "@/components/crm/deal-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBudget } from "@/lib/utils";
import { BriefcaseBusiness } from "lucide-react";

type DealRow = Prisma.DealGetPayload<{ include: { account: true; lane: true } }>;

export function DealTable({ deals }: { deals: DealRow[] }) {
  if (deals.length === 0) {
    return (
      <EmptyState
        icon={BriefcaseBusiness}
        title="No deals yet"
        description="Run a discovery lane or create a deal to start the client-acquisition pipeline."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deal</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Lane</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Pursuit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => (
            <TableRow key={deal.id}>
              <TableCell className="max-w-md">
                <Link href={`/deals/${deal.id}`} className="font-medium hover:text-primary hover:underline">
                  {deal.title}
                </Link>
                {deal.nextAction && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {deal.nextAction}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {deal.account ? (
                  <Link href={`/accounts/${deal.account.id}`} className="text-sm hover:text-primary hover:underline">
                    {deal.account.name}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">No account</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{deal.lane?.name ?? "Manual"}</TableCell>
              <TableCell className="tnum whitespace-nowrap text-sm">
                {formatBudget(deal.valueMin, deal.valueMax, deal.currency ?? "DKK")}
              </TableCell>
              <TableCell><DeadlinePill deadline={deal.deadline} /></TableCell>
              <TableCell><DealStatusBadge status={deal.status} /></TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <ScoreBadge score={deal.pursuitScore} size="sm" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
