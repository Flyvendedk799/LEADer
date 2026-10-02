import Link from "next/link";
import { NewAccount } from "@/components/crm/new-account";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { workspaceFromRoute } from "@/lib/workspace-context";
import { Building2 } from "lucide-react";

import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreBadge } from "@/components/shared/score-badge";
import { Card, CardContent } from "@/components/ui/card";
import { pluralize } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AccountsPage(props: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const searchParams = await props.searchParams;
  const workspace = workspaceFromRoute("/accounts", searchParams);
  const query = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const ownerId = await requireOwnerId();
  const accounts = await db.account.findMany({
    where: {
      ownerId,
      workspace,
      ...(query
        ? { name: { contains: query, mode: "insensitive" as const } }
        : {}),
    },
    include: { _count: { select: { deals: true, people: true, tasks: true } } },
    orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        description="Companies, buyers, and relationships behind your next project."
      >
        <NewAccount workspace={workspace} />
      </PageHeader>
      <form className="flex gap-2">
        <input type="hidden" name="workspace" value={workspace} />
        <Input
          name="q"
          aria-label="Search accounts"
          placeholder="Search accounts…"
          defaultValue={query}
          className="max-w-md bg-card"
        />
        <Button variant="outline">Search</Button>
      </form>
      {!accounts.length && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Building2 className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h2 className="font-semibold">
            {query ? "No matching accounts" : "Build your network"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {query
              ? "Try another company name or clear the search."
              : "Add a company to start tracking the people and opportunities behind it."}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => (
          <Link key={account.id} href={`/accounts/${account.id}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h2 className="truncate text-sm font-semibold">
                      {account.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account.type.replaceAll("_", " ").toLowerCase()} ·{" "}
                    {pluralize(account._count.deals, "deal")} ·{" "}
                    {pluralize(account._count.people, "person", "people")}
                  </p>
                  {account.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {account.description}
                    </p>
                  )}
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
