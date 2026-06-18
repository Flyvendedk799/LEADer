import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { listOpportunities } from "@/lib/opportunities";
import { parseFilters } from "@/lib/validators";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { OpportunityTable } from "@/components/opportunities/opportunity-table";
import { FilterRail } from "@/components/opportunities/filter-rail";
import { ExportDialog } from "@/components/opportunities/export-dialog";
import { NewOpportunityDialog } from "@/components/opportunities/new-opportunity-dialog";

function toSearchParams(input: Record<string, string | string[]>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value != null) params.append(key, value);
  }
  return params;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[]>;
}) {
  const ownerId = await requireOwnerId();

  const sp = toSearchParams(searchParams);
  if (!sp.get("workspace")) sp.set("workspace", "DK");
  const filters = parseFilters(sp);

  const [{ items, total, page, pageSize }, sources, lists] = await Promise.all([
    listOpportunities(ownerId, filters),
    db.source.findMany({
      where: { ownerId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.list.findMany({
      where: { ownerId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const pageHref = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(p));
    return `/opportunities?${next.toString()}`;
  };

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Opportunities"
        description="Your lead pipeline — scored, filtered and ready to action."
      >
        <NewOpportunityDialog />
        <ExportDialog filters={filters as Record<string, unknown>} />
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-64">
          <FilterRail sources={sources} basePath="/opportunities" />
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total === 0
                ? "No results"
                : `Showing ${from}–${to} of ${total} ${total === 1 ? "opportunity" : "opportunities"}`}
            </span>
          </div>

          <OpportunityTable items={items} selectable sortable lists={lists} />

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild={page > 1}
                  disabled={page <= 1}
                >
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Link>
                  ) : (
                    <span>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild={page < totalPages}
                  disabled={page >= totalPages}
                >
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
