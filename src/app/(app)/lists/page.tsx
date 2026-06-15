import Link from "next/link";
import { ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { OPPORTUNITY_INCLUDE } from "@/lib/opportunities";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { ListManager, type ListSummary } from "@/components/lists/list-manager";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const ownerId = await requireOwnerId();

  const lists = await db.list.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { items: true } },
      items: {
        orderBy: { addedAt: "desc" },
        include: { opportunity: { include: OPPORTUNITY_INCLUDE } },
      },
    },
  });

  const summaries: ListSummary[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    color: l.color,
    _count: l._count,
  }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Lists"
        description="Organise opportunities into curated working sets."
      >
        <Button asChild variant="outline">
          <Link href="/opportunities">Browse opportunities</Link>
        </Button>
      </PageHeader>

      <ListManager lists={summaries} />

      <div className="mt-10 space-y-10">
        {lists.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No lists yet"
            description="Create your first list above, then add opportunities to it from the opportunities view."
          />
        ) : (
          lists.map((list) => (
            <section key={list.id} id={`list-${list.id}`} className="scroll-mt-20">
              <div className="mb-4 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: list.color ?? "var(--muted-foreground)" }}
                />
                <h2 className="text-lg font-semibold tracking-tight">{list.name}</h2>
                <span className="tnum text-sm text-muted-foreground">
                  · {list._count.items} {list._count.items === 1 ? "item" : "items"}
                </span>
              </div>
              <Separator className="mb-4" />

              {list.items.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="This list is empty"
                  description="Add opportunities to this list from the opportunities view."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.items.map((item) => (
                    <OpportunityCard key={item.id} opportunity={item.opportunity} />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
