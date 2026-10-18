"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { ScoreBadge } from "@/components/shared/score-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { DealStatusBadge } from "@/components/crm/deal-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBudget } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown, BriefcaseBusiness, ChevronRight, SearchX } from "lucide-react";

type DealRow = Prisma.DealGetPayload<{
  include: { account: true; lane: true };
}>;

function SortHeader({
  label,
  sortKey,
  currentSort,
  buildHref,
  className,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  buildHref: (key: string) => string;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  const isAscending = sortKey === "deadline";
  const ariaSort = isActive ? (isAscending ? "ascending" : "descending") : "none";

  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <Link
        href={buildHref(sortKey)}
        className="min-h-11 inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors group"
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {isActive ? (
          isAscending ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/60 opacity-60 group-hover:opacity-100" />
        )}
      </Link>
    </TableHead>
  );
}

export function DealTable({
  deals,
  searchQuery,
  workspace = "DK",
}: {
  deals: DealRow[];
  searchQuery?: string;
  workspace?: string;
}) {
  const pathname = usePathname() || "/deals";
  const searchParams = useSearchParams();
  const currentSort = searchParams?.get("sort") || "score";

  function buildSortHref(sortKey: string) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.set("sort", sortKey);
    next.delete("page"); // reset pagination appropriately
    return `${pathname}?${next.toString()}`;
  }

  if (deals.length === 0 && searchQuery) {
    return (
      <EmptyState
        icon={SearchX}
        title="No deals match your search"
        description={`Nothing matched “${searchQuery}”. Try a different keyword or clear the search.`}
      >
        <Button asChild variant="outline" size="sm">
          <Link href={`/deals?workspace=${workspace}`}>Clear search</Link>
        </Button>
      </EmptyState>
    );
  }

  if (deals.length === 0) {
    return (
      <EmptyState
        icon={BriefcaseBusiness}
        title="No deals yet"
        description="Track your pipeline and manage active deals."
      >
        <Button asChild>
          <Link href={`/deals?workspace=${workspace}&new=1`}>
            Add deal
          </Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0 rounded-lg border border-border bg-card">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader
                label="Deal"
                sortKey="recent"
                currentSort={currentSort}
                buildHref={buildSortHref}
              />
              <TableHead className="hidden md:table-cell">Account</TableHead>
              <TableHead className="hidden xl:table-cell">Lane</TableHead>
              <SortHeader
                label="Value"
                sortKey="value"
                currentSort={currentSort}
                buildHref={buildSortHref}
                className="hidden lg:table-cell"
              />
              <SortHeader
                label="Deadline"
                sortKey="deadline"
                currentSort={currentSort}
                buildHref={buildSortHref}
                className="hidden sm:table-cell"
              />
              <TableHead>Status</TableHead>
              <SortHeader
                label="Match"
                sortKey="score"
                currentSort={currentSort}
                buildHref={buildSortHref}
                className="text-right"
              />
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal) => (
              <TableRow key={deal.id} className="group relative">
                <TableCell className="max-w-md min-w-[180px]">
                  <Link
                    prefetch={false}
                    href={`/deals/${deal.id}?workspace=${deal.workspace}`}
                    className="font-medium hover:text-primary "
                  >
                    {deal.title}
                  </Link>
                  {deal.account && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                      {deal.account.name}
                    </div>
                  )}
                  {deal.nextAction && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {deal.nextAction}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {deal.account ? (
                    <Link
                      prefetch={false}
                      href={`/accounts/${deal.account.id}?workspace=${deal.workspace}`}
                      className="relative z-10 text-sm hover:text-primary hover:underline"
                    >
                      {deal.account.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No account
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                  {deal.lane?.name ?? "Manual"}
                </TableCell>
                <TableCell className="tnum hidden whitespace-nowrap text-sm lg:table-cell">
                  {formatBudget(
                    deal.valueMin,
                    deal.valueMax,
                    deal.currency ?? "DKK",
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <DeadlinePill deadline={deal.deadline} />
                </TableCell>
                <TableCell>
                  <DealStatusBadge status={deal.status} />
                </TableCell>
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
    </div>
  );
}
