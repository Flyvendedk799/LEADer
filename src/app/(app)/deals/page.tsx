import { PageHeader } from "@/components/shared/page-header";
import { DealTable } from "@/components/crm/deal-table";
import { Button } from "@/components/ui/button";
import { requireOwnerId } from "@/lib/auth";
import { listDeals } from "@/lib/crm";
import Link from "next/link";
import { Search } from "lucide-react";

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
  const { items, total } = await listDeals(ownerId, params);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deals"
        description={`${total} active and historical pursuits across accounts, lanes, and sources.`}
      >
        <Button asChild>
          <Link href="/discover">
            <Search className="h-4 w-4" />
            Find leads
          </Link>
        </Button>
      </PageHeader>
      <DealTable deals={items} />
    </div>
  );
}
