import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  FolderTree,
  ListChecks,
  MapPin,
  Radar,
  Route,
  User2,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/shared/score-badge";
import { DeadlinePill } from "@/components/shared/deadline-pill";
import { StatusSelect } from "@/components/opportunities/status-select";
import { ScoreBreakdown } from "@/components/opportunities/score-breakdown";
import { ActivityTimeline } from "@/components/opportunities/activity-timeline";
import { NotesSection } from "@/components/opportunities/notes-section";
import { DraftViewer } from "@/components/opportunities/draft-viewer";
import { AiActionPanel } from "@/components/opportunities/ai-action-panel";
import { ExportDialog } from "@/components/opportunities/export-dialog";
import { formatBudget, formatDate } from "@/lib/utils";
import { SOURCE_TYPE_META } from "@/lib/display";
import type { SourceType } from "@/lib/types";

const ROUTE_LABELS: Record<string, string> = {
  DIRECT: "Direct contact",
  APPLICATION: "Formal application",
  UNKNOWN: "Unknown",
};

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="text-right text-foreground">{value || "—"}</span>
    </div>
  );
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ownerId = await requireOwnerId();

  const opportunity = await db.opportunity.findUnique({
    where: { id: params.id },
    include: {
      source: true,
      contacts: true,
      attachments: true,
      tags: { include: { tag: true } },
      notes: { orderBy: { createdAt: "desc" } },
      drafts: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!opportunity || opportunity.ownerId !== ownerId) notFound();

  const requirements = Array.isArray(opportunity.extractedRequirements)
    ? (opportunity.extractedRequirements as unknown[]).map(String)
    : [];

  const related = opportunity.category
    ? await db.opportunity.findMany({
        where: {
          ownerId,
          category: opportunity.category,
          id: { not: opportunity.id },
        },
        select: { id: true, title: true, matchScore: true },
        orderBy: { matchScore: "desc" },
        take: 5,
      })
    : [];

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{opportunity.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {opportunity.organization && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {opportunity.organization}
                </span>
              )}
              {opportunity.url && (
                <a
                  href={opportunity.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open source
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusSelect id={opportunity.id} status={opportunity.status} />
            <DeadlinePill deadline={opportunity.deadline} />
            <ScoreBadge score={opportunity.matchScore} size="lg" showLabel />
            <ExportDialog ids={[opportunity.id]} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {opportunity.aiSummary || opportunity.description || "No description available."}
              </p>

              {opportunity.whyRelevant && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Why this is relevant
                    </p>
                    <p className="text-sm text-foreground">{opportunity.whyRelevant}</p>
                  </div>
                </>
              )}

              {requirements.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <ListChecks className="h-3.5 w-3.5" />
                      Requirements
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
                      {requirements.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {opportunity.tags.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-1.5">
                    {opportunity.tags.map((t) => (
                      <span
                        key={t.tagId}
                        className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <ScoreBreakdown breakdown={opportunity.scoreBreakdown} />
          <NotesSection id={opportunity.id} notes={opportunity.notes} />
          <DraftViewer drafts={opportunity.drafts} />
          <ActivityTimeline activities={opportunity.activities} />
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {/* Contacts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User2 className="h-4 w-4 text-primary" />
                Contacts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {opportunity.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {opportunity.contacts.map((c) => (
                    <li key={c.id} className="text-sm">
                      <p className="font-medium text-foreground">{c.name || "Unnamed contact"}</p>
                      {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline">
                          {c.email}
                        </a>
                      )}
                      {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              {opportunity.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attachments.</p>
              ) : (
                <ul className="space-y-2">
                  {opportunity.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {a.label || a.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Meta */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MetaRow
                icon={Radar}
                label="Source"
                value={
                  opportunity.source
                    ? `${opportunity.source.name} · ${SOURCE_TYPE_META[opportunity.source.type as SourceType]?.label ?? opportunity.source.type}`
                    : "—"
                }
              />
              <MetaRow icon={FolderTree} label="Category" value={opportunity.category} />
              <MetaRow
                icon={MapPin}
                label="Location"
                value={opportunity.location || opportunity.region || opportunity.country}
              />
              <MetaRow
                icon={Wallet}
                label="Budget"
                value={formatBudget(
                  opportunity.budgetMin,
                  opportunity.budgetMax,
                  opportunity.currency ?? "DKK",
                )}
              />
              <MetaRow
                icon={Route}
                label="Application route"
                value={ROUTE_LABELS[opportunity.applicationRoute] ?? opportunity.applicationRoute}
              />
              <MetaRow
                icon={CalendarDays}
                label="Created"
                value={formatDate(opportunity.createdAt)}
              />
            </CardContent>
          </Card>

          <AiActionPanel opportunityId={opportunity.id} />

          {/* Related */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Related opportunities</CardTitle>
            </CardHeader>
            <CardContent>
              {related.length === 0 ? (
                <p className="text-sm text-muted-foreground">No related opportunities.</p>
              ) : (
                <ul className="space-y-2">
                  {related.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3">
                      <Link
                        href={`/opportunities/${r.id}`}
                        className="truncate text-sm text-foreground hover:text-primary hover:underline"
                      >
                        {r.title}
                      </Link>
                      <ScoreBadge score={r.matchScore} size="sm" />
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
