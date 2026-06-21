import Link from "next/link";
import { Building2 } from "lucide-react";

import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreBadge } from "@/components/shared/score-badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const ownerId = await requireOwnerId();
  const accounts = await db.account.findMany({
    where: { ownerId },
    include: { _count: { select: { deals: true, people: true, tasks: true } } },
    orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Accounts" description="Companies, buyers, communities, and warm relationships behind your deals." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => (
          <Link key={account.id} href={`/accounts/${account.id}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h2 className="truncate text-sm font-semibold">{account.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account.type} · {account._count.deals} deals · {account._count.people} people
                  </p>
                  {account.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{account.description}</p>}
                </div>
                <ScoreBadge score={account.fitScore} size="sm" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
