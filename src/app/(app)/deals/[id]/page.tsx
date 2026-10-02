import { EvidenceProvenance } from "@/components/discovery/evidence-provenance";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Building2, Mail } from "lucide-react";
import { requireOwnerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEAL_INCLUDE } from "@/lib/crm";
import { formatBudget, formatDate } from "@/lib/utils";
import { DealStatusBadge } from "@/components/crm/deal-status-badge";
import { DealActions } from "@/components/crm/deal-actions";
import { DealAiPanel } from "@/components/crm/deal-ai-panel";
import { EditDeal } from "@/components/crm/edit-deal";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/shared/section-tabs";
import { TaskList } from "@/components/tasks/task-list";
import { ScoreBadge } from "@/components/shared/score-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResearchBriefLauncher } from "@/components/workflows/research-brief-launcher";
export const dynamic = "force-dynamic";
export default async function DealDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const ownerId = await requireOwnerId();
  const deal = await db.deal.findFirst({
    where: { id: params.id, ownerId },
    include: {
      ...DEAL_INCLUDE,
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 100 },
      touchpoints: { orderBy: { occurredAt: "desc" }, take: 100 },
      evidence: { orderBy: { createdAt: "desc" }, take: 100 },
      conversionAssets: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!deal) notFound();
  return (
    <div className="space-y-6">
      <Link
        href={"/deals?workspace=" + deal.workspace}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to deals
      </Link>
      <PageHeader
        title={deal.title}
        description={deal.account?.name || "Independent opportunity"}
      >
        <EditDeal deal={deal} />
        {deal.url && (
          <Button asChild variant="outline" size="sm">
            <a href={deal.url} target="_blank" rel="noreferrer">
              Source <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </PageHeader>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4">
        <DealStatusBadge status={deal.status} />
        <span className="border-l pl-4 text-sm font-medium">
          {formatBudget(deal.valueMin, deal.valueMax, deal.currency || "DKK")}
        </span>
        <span className="text-sm text-muted-foreground">
          {deal.deadline
            ? "Due " + formatDate(deal.deadline)
            : "No deadline set"}
        </span>
        <div className="ml-auto">
          <ScoreBadge score={deal.pursuitScore} showLabel />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <SectionTabs
            sections={[
              {
                id: "overview",
                label: "Overview",
                content: (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>Deal brief</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                          {deal.summary ||
                            deal.rawContent ||
                            "Add a brief to capture the opportunity, the buyer’s needs, and why this is a fit."}
                        </p>
                        <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                            Next action
                          </p>
                          <p className="text-sm leading-6">
                            {deal.nextAction ||
                              "Choose a concrete next step. Use Edit deal to keep it visible here, then add a task to schedule it."}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Follow-ups & tasks</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <TaskList
                          tasks={deal.tasks.map((task) => ({
                            ...task,
                            deal: { id: deal.id, title: deal.title },
                          }))}
                        />
                      </CardContent>
                    </Card>
                  </>
                ),
              },
              {
                id: "evidence",
                label: "Evidence (" + deal.evidence.length + ")",
                content: (
                  <Card>
                    <CardHeader>
                      <CardTitle>Why this opportunity exists</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {deal.evidence.map((item) => (
                        <div key={item.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium">
                              {item.title || item.sourceName || item.kind}
                            </p>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Open evidence source"
                                className="text-primary"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                          <EvidenceProvenance metadata={item.metadata} />
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">
                            {item.snippet}
                          </p>
                        </div>
                      ))}
                      {!deal.evidence.length && (
                        <p className="text-sm text-muted-foreground">
                          No evidence attached yet. Check the source and record
                          what you learn in Activity.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ),
              },
              {
                id: "activity",
                label: "Activity & contacts",
                content: (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>People</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {deal.people.map(({ person, role }) => (
                          <div
                            key={person.id}
                            className="rounded-lg border p-4"
                          >
                            <p className="text-sm font-medium">
                              {person.name || person.email || "Contact"}
                            </p>
                            <p className="my-1 text-xs text-muted-foreground">
                              {role || person.role}
                            </p>
                            {person.email && (
                              <a
                                href={"mailto:" + person.email}
                                className="flex items-center gap-2 text-sm text-primary"
                              >
                                <Mail className="h-3 w-3" />
                                {person.email}
                              </a>
                            )}
                          </div>
                        ))}
                        {!deal.people.length && (
                          <p className="text-sm text-muted-foreground">
                            Add the person you’re speaking with using the
                            contact form.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Conversation history</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        {deal.touchpoints.map((item) => (
                          <div
                            key={item.id}
                            className="border-l-2 border-primary/25 pl-4"
                          >
                            <p className="text-xs text-muted-foreground">
                              {item.kind.toLowerCase()} ·{" "}
                              {formatDate(item.occurredAt)}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                              {item.summary}
                            </p>
                          </div>
                        ))}
                        {!deal.touchpoints.length && (
                          <p className="text-sm text-muted-foreground">
                            Log a note, email, call, or meeting to keep the
                            conversation in context.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ),
              },
              {
                id: "drafts",
                label: "Research & drafts",
                content: (
                  <>
                    <DealAiPanel dealId={deal.id} />
                    <Card>
                      <CardHeader>
                        <CardTitle>Research the opportunity</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResearchBriefLauncher
                          defaultSubject={deal.account?.name || deal.title}
                          subjectType={deal.account ? "company" : "unknown"}
                          objective="map-opportunity"
                          depth="standard"
                          workspace={deal.workspace}
                          accountId={deal.accountId}
                          dealId={deal.id}
                        />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Saved drafts</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {deal.conversionAssets.map((asset) => (
                          <details
                            key={asset.id}
                            className="rounded-lg border p-4"
                          >
                            <summary className="text-sm font-medium">
                              {asset.kind.replaceAll("_", " ").toLowerCase()} ·{" "}
                              {formatDate(asset.createdAt)}
                            </summary>
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                              {asset.content}
                            </p>
                          </details>
                        ))}
                        {!deal.conversionAssets.length && (
                          <p className="text-sm text-muted-foreground">
                            Use the assistant to prepare an introduction,
                            proposal, or follow-up. Drafts are saved here for
                            your review.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ),
              },
            ]}
          />
        </div>
        <aside className="min-w-0 space-y-4">
          <Card>
            <CardContent className="pt-5">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Account
              </p>
              {deal.account ? (
                <Link
                  href={"/accounts/" + deal.account.id}
                  className="text-sm font-medium text-primary"
                >
                  {deal.account.name} →
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No linked account
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {deal.workspace === "DK" ? "Denmark" : "International"} ·{" "}
                {deal.lane?.name || "Added manually"}
              </p>
            </CardContent>
          </Card>
          <DealActions
            dealId={deal.id}
            accountId={deal.accountId}
            status={deal.status}
          />
        </aside>
      </div>
    </div>
  );
}
