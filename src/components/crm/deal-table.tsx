import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { ScoreBadge } from "@/components/shared/score-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { DealStatusBadge } from "@/components/crm/deal-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBudget } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BriefcaseBusiness, ChevronRight, SearchX } from "lucide-react";

type DealRow = Prisma.DealGetPayload<{ include: { account: true; lane: true } }>;

export function DealTable({ deals, searchQuery }: { deals: DealRow[]; searchQuery?: string }) {
  if (deals.length === 0 && searchQuery) {
    return (
      <EmptyState
        icon={SearchX}
        title="No deals match your search"
        description={`Nothing matched “${searchQuery}”. Try a different keyword or clear the search.`}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/deals">Clear search</Link>
        </Button>
      </EmptyState>
    );
  }

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
            <TableHead className="hidden md:table-cell">Account</TableHead>
            <TableHead className="hidden xl:table-cell">Lane</TableHead>
            <TableHead className="hidden lg:table-cell">Value</TableHead>
            <TableHead className="hidden sm:table-cell">Deadline</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Pursuit</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => (
            <TableRow key={deal.id} className="group relative">
              <TableCell className="max-w-md">
                <Link href={`/deals/${deal.id}`} className="font-medium hover:text-primary before:absolute before:inset-0">
                  {deal.title}
                </Link>
                {deal.account && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">{deal.account.name}</div>
                )}
                {deal.nextAction && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {deal.nextAction}
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {deal.account ? (
                  <Link href={`/accounts/${deal.account.id}`} className="relative z-10 text-sm hover:text-primary hover:underline">
                    {deal.account.name}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">No account</span>
                )}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{deal.lane?.name ?? "Manual"}</TableCell>
              <TableCell className="tnum hidden whitespace-nowrap text-sm lg:table-cell">
                {formatBudget(deal.valueMin, deal.valueMax, deal.currency ?? "DKK")}
              </TableCell>
              <TableCell className="hidden sm:table-cell"><DeadlinePill deadline={deal.deadline} /></TableCell>
              <TableCell><DealStatusBadge status={deal.status} /></TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <ScoreBadge score={deal.pursuitScore} size="sm" />
                </div>
              </TableCell>
              <TableCell>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
