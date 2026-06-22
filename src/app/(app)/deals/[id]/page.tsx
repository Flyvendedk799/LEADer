import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, ExternalLink, ListChecks } from "lucide-react";

import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEAL_INCLUDE } from "@/lib/crm";
import { formatBudget, formatDate, relativeDeadline } from "@/lib/utils";
import { DealStatusBadge } from "@/components/crm/deal-status-badge";
import { DealAiPanel } from "@/components/crm/deal-ai-panel";
import { ScoreBadge } from "@/components/shared/score-badge";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResearchBriefLauncher } from "@/components/workflows/research-brief-launcher";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const ownerId = await requireOwnerId();
  const deal = await db.deal.findFirst({ where: { id: params.id, ownerId }, include: DEAL_INCLUDE });
  if (!deal) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={deal.title} description={deal.account?.name ?? "No account linked"}>
        <DealStatusBadge status={deal.status} />
        <ScoreBadge score={deal.pursuitScore} size="lg" showLabel />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <main className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Deal brief</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-7">{deal.summary || deal.rawContent || "No summary yet."}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Meta label="Value" value={formatBudget(deal.valueMin, deal.valueMax, deal.currency ?? "DKK")} />
                <Meta label="Deadline" value={`${formatDate(deal.deadline)} · ${relativeDeadline(deal.deadline)}`} />
                <Meta label="Lane" value={deal.lane?.name ?? "Manual"} />
              </div>
              {deal.nextAction && (
                <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                  <p className="mb-1 font-medium">Next action</p>
                  <p className="text-muted-foreground">{deal.nextAction}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Evidence</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {deal.evidence.map((evidence) => (
                <div key={evidence.id} className="rounded-md border border-border bg-surface/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{evidence.title || evidence.sourceName || evidence.kind}</p>
                    {evidence.url && (
                      <a href={evidence.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{evidence.snippet}</p>
                </div>
              ))}
              {deal.evidence.length === 0 && <p className="text-sm text-muted-foreground">No evidence recorded.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Conversion assets</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {deal.conversionAssets.map((asset) => (
                <div key={asset.id} className="rounded-md border border-border bg-surface/40 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{asset.kind}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{asset.content}</p>
                </div>
              ))}
              {deal.conversionAssets.length === 0 && <p className="text-sm text-muted-foreground">Generate outreach, proposal, follow-up, or call prep from the assistant.</p>}
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <ResearchBriefLauncher
                defaultSubject={deal.account?.name ?? deal.title}
                subjectType={deal.account ? "company" : "unknown"}
                objective={deal.account ? "map-opportunity" : "verify-identity"}
                depth="standard"
                workspace={deal.workspace}
                accountId={deal.accountId}
                dealId={deal.id}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-primary" />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {deal.account ? (
                <Link href={`/accounts/${deal.account.id}`} className="font-medium hover:text-primary hover:underline">
                  {deal.account.name}
                </Link>
              ) : (
                <p className="text-muted-foreground">No account linked.</p>
              )}
              {deal.url && (
                <a href={deal.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Source
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListChecks className="h-4 w-4 text-primary" />
                Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deal.tasks.map((task) => (
                <div key={task.id} className="rounded-md border border-border bg-surface/40 p-2 text-sm">
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.status} · {formatDate(task.dueAt)}</p>
                </div>
              ))}
              {deal.tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
            </CardContent>
          </Card>

          <DealAiPanel dealId={deal.id} />
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
