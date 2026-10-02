import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DealTable } from "@/components/crm/deal-table";
import { DealSavedSearch } from "@/components/crm/deal-saved-search";
import { NewDealDialog } from "@/components/crm/new-deal-dialog";
import { Button } from "@/components/ui/button";
import { requireOwnerId } from "@/lib/auth";
import { listDeals } from "@/lib/crm";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { pluralize } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[]>;
}) {
  const ownerId = await requireOwnerId();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  if (!params.get("workspace")) params.set("workspace", "DK");
  const { items, total, page, pageSize } = await listDeals(ownerId, params);
  const query = params.get("q")?.trim() ?? "";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (target: number) => {
    const next = new URLSearchParams(params);
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    return `/deals?${next.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deals"
        description={`${pluralize(total, "pursuit")}, active and historical, across accounts, lanes, and sources.`}
      >
        <Suspense>
          <DealSavedSearch />
          <NewDealDialog />
        </Suspense>
        <Button asChild>
          <Link href="/discover">
            <Search className="h-4 w-4" />
            Find leads
          </Link>
        </Button>
      </PageHeader>
      <DealTable deals={items} searchQuery={query} />
      {pageCount > 1 && (
        <nav aria-label="Deals pagination" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="tnum">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : undefined}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)} aria-disabled={page >= pageCount} className={page >= pageCount ? "pointer-events-none opacity-50" : undefined}>
                Next <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
