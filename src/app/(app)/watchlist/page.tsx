import Link from "next/link";
import { Search, Star } from "lucide-react";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { OPPORTUNITY_INCLUDE } from "@/lib/opportunities";
import { describeSavedSearchFilters, savedSearchFiltersToHref } from "@/lib/saved-searches";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OpportunityTable } from "@/components/opportunities/opportunity-table";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const ownerId = await requireOwnerId();

  const [watchItems, savedSearches] = await Promise.all([
    db.watchlistItem.findMany({
      where: { ownerId },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { opportunity: { include: OPPORTUNITY_INCLUDE } },
    }),
    db.savedSearch.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const opportunities = watchItems.map((w) => w.opportunity);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Watchlist"
        description="Your pinned, high-priority opportunities."
      >
        <Button asChild variant="outline">
          <Link href="/opportunities">Browse opportunities</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {opportunities.length === 0 ? (
            <EmptyState
              icon={Star}
              title="Nothing on your watchlist yet"
              description="Pin opportunities from the opportunities view to keep your highest-priority leads here."
            >
              <Button asChild>
                <Link href="/opportunities">Find opportunities</Link>
              </Button>
            </EmptyState>
          ) : (
            <OpportunityTable items={opportunities} />
          )}
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-muted-foreground" />
                Saved searches
              </CardTitle>
              <CardDescription>
                Jump back into the filters you saved on the opportunities view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {savedSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved searches yet. Save a filter set from the opportunities view to
                  see it here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {savedSearches.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={savedSearchFiltersToHref(s.filters)}
                        className="block rounded-lg border border-border bg-surface/50 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-surface-2"
                      >
                        <span className="block text-sm font-medium">{s.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {describeSavedSearchFilters(s.filters)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
