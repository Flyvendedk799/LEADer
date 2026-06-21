import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBudget, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreBadge } from "@/components/shared/score-badge";
import { DealStatusBadge } from "@/components/crm/deal-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const ownerId = await requireOwnerId();
  const account = await db.account.findFirst({
    where: { id: params.id, ownerId },
    include: {
      people: true,
      deals: { include: { lane: true }, orderBy: { pursuitScore: "desc" } },
      evidence: { orderBy: { createdAt: "desc" }, take: 8 },
      touchpoints: { orderBy: { occurredAt: "desc" }, take: 8 },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 8 },
    },
  });
  if (!account) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={account.name} description={`${account.type} · ${account.workspace}`}>
        <ScoreBadge score={account.fitScore} size="lg" showLabel />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Deals</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {account.deals.map((deal) => (
                <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 hover:border-primary/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{deal.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBudget(deal.valueMin, deal.valueMax, deal.currency ?? "DKK")} · {deal.lane?.name ?? "Manual"}
                    </p>
                  </div>
                  <DealStatusBadge status={deal.status} />
                </Link>
              ))}
              {account.deals.length === 0 && <p className="text-sm text-muted-foreground">No deals yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Evidence</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {account.evidence.map((evidence) => (
                <div key={evidence.id} className="rounded-md border border-border bg-surface/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{evidence.title || evidence.kind}</p>
                    {evidence.url && <a href={evidence.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{evidence.snippet}</p>
                </div>
              ))}
              {account.evidence.length === 0 && <p className="text-sm text-muted-foreground">No evidence yet.</p>}
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">People</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {account.people.map((person) => (
                <div key={person.id} className="rounded-md border border-border bg-surface/40 p-3 text-sm">
                  <p className="font-medium">{person.name || person.email || "Unnamed person"}</p>
                  <p className="text-xs text-muted-foreground">{[person.role, person.email].filter(Boolean).join(" · ") || "No details"}</p>
                </div>
              ))}
              {account.people.length === 0 && <p className="text-sm text-muted-foreground">No people yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Tasks</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {account.tasks.map((task) => (
                <div key={task.id} className="rounded-md border border-border bg-surface/40 p-2 text-sm">
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.status} · {formatDate(task.dueAt)}</p>
                </div>
              ))}
              {account.tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
