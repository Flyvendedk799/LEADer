"use client";
import { EvidenceProvenance } from "./evidence-provenance";

import * as React from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CheckCircle2,
  CopyX,
  ExternalLink,
  RotateCw,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/shared/score-badge";
import { cn, formatBudget, formatDate, truncate } from "@/lib/utils";

export type CandidateAction = "review" | "save" | "dismiss" | "duplicate";

export type Candidate = {
  id: string;
  title: string;
  description?: string | null;
  rawContent?: string | null;
  url?: string | null;
  organization?: string | null;
  sourceName?: string | null;
  sourceKind?: string | null;
  provider?: string | null;
  query?: string | null;
  status: string;
  hiddenReason?: string | null;
  category?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  currency?: string | null;
  deadline?: string | Date | null;
  pursuitScore?: number | null;
  confidenceScore?: number | null;
  signals: string[];
  reasons: string[];
  deal?: { id: string; title: string } | null;
  evidence?: {
    id: string;
    title?: string | null;
    snippet: string;
    url?: string | null;
    confidence?: number | null;
    metadata?: unknown;
  }[];
};

export function CandidateCard({
  candidate,
  onAction,
  hidden = false,
}: {
  candidate: Candidate;
  onAction: (id: string, action: CandidateAction) => void;
  hidden?: boolean;
}) {
  const saved = candidate.status === "SAVED" && candidate.deal;
  const closed =
    candidate.status === "DISMISSED" || candidate.status === "DUPLICATE";
  const evidence = candidate.evidence?.slice(0, 3) ?? [];
  const statusVariant =
    candidate.status === "SAVED"
      ? "success"
      : candidate.status === "DISMISSED" || candidate.status === "DUPLICATE"
        ? "muted"
        : candidate.status === "REVIEWED"
          ? "secondary"
          : "default";

  return (
    <article
      id={`candidate-${candidate.id}`}
      className={cn(
        "scroll-mt-24 rounded-lg border border-border bg-card p-4 shadow-sm",
        hidden && "border-dashed bg-muted/30",
        hidden && "border-warning/50 bg-warning/5",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-base font-semibold leading-snug">
              {candidate.title}
            </h2>
            {candidate.url && (
              <a
                href={candidate.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "text-muted-foreground hover:text-primary",
                  hidden && "text-warning hover:text-warning",
                )}
                aria-label={hidden ? "Open rejected source" : "Open source"}
                title={
                  hidden
                    ? `Open rejected source: ${candidate.hiddenReason ?? candidate.status.toLowerCase()}`
                    : "Open source"
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <Badge variant={statusVariant}>
              {candidate.status.toLowerCase()}
            </Badge>
            {hidden ? <Badge variant="warning">rejected result</Badge> : null}
            {candidate.hiddenReason ? (
              <Badge variant="warning">{candidate.hiddenReason}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {[candidate.organization, candidate.sourceName, candidate.category]
              .filter(Boolean)
              .join(" · ") || "Discovery candidate"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <ScoreBadge score={candidate.confidenceScore} size="sm" />
            <p className="mt-1 text-[10px] uppercase text-muted-foreground">
              Confidence
            </p>
          </div>
          <div className="text-center">
            <ScoreBadge score={candidate.pursuitScore} size="lg" showLabel />
            <p className="mt-1 text-[10px] uppercase text-muted-foreground">
              Pursuit
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {truncate(candidate.description || candidate.rawContent, 460)}
      </p>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Meta
          label="Budget"
          value={formatBudget(
            candidate.budgetMin,
            candidate.budgetMax,
            candidate.currency ?? "DKK",
          )}
        />
        <Meta label="Deadline" value={formatDate(candidate.deadline)} />
        <Meta
          label="Source"
          value={
            candidate.sourceKind === "source-scan"
              ? "saved source"
              : candidate.provider || "web"
          }
        />
        <Meta
          label="Status"
          value={hidden ? "rejected" : candidate.status.toLowerCase()}
        />
      </div>

      {(candidate.signals.length > 0 || candidate.reasons.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[...candidate.signals, ...candidate.reasons]
            .slice(0, 12)
            .map((signal) => (
              <Badge
                key={signal}
                variant={
                  signal.startsWith("avoid:") || signal.startsWith("Negative")
                    ? "warning"
                    : "secondary"
                }
                className="max-w-full truncate"
                title={signal}
              >
                {signal}
              </Badge>
            ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="mt-4 grid gap-2">
          {evidence.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-border bg-surface/50 p-3 text-sm text-muted-foreground"
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">
                  {item.title || "Evidence"}
                </p>
                {item.confidence != null && (
                  <Badge variant="outline">{item.confidence}% confidence</Badge>
                )}
              </div>
              <EvidenceProvenance metadata={item.metadata} />
              <p className="leading-6">{truncate(item.snippet, 300)}</p>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {hidden ? "Rejected source" : "Source"}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {!hidden ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {saved ? (
            <Button
              asChild
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Link href={`/deals/${candidate.deal!.id}`}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Deal saved — View
              </Link>
            </Button>
          ) : closed ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAction(candidate.id, "review")}
            >
              <RotateCw className="h-4 w-4 mr-1.5" />
              Re-evaluate
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onAction(candidate.id, "dismiss")}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Dismiss
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onAction(candidate.id, "duplicate")}
              >
                <CopyX className="h-4 w-4 mr-1.5" />
                Duplicate
              </Button>
              <Button size="sm" onClick={() => onAction(candidate.id, "save")}>
                <BriefcaseBusiness className="h-4 w-4 mr-1.5" />
                Save as deal
              </Button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function RejectedCandidateRow({ candidate }: { candidate: Candidate }) {
  const sourceText =
    [candidate.organization, candidate.sourceName, candidate.provider]
      .filter(Boolean)
      .join(" · ") || "Filtered discovery row";
  const reason = candidate.hiddenReason || candidate.status.toLowerCase();

  return (
    <article
      id={`candidate-${candidate.id}`}
      className="scroll-mt-24 rounded-md border border-dashed border-warning/50 bg-warning/5 p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">filtered out</Badge>
            <Badge
              variant="outline"
              className="max-w-full truncate"
              title={reason}
            >
              {reason}
            </Badge>
            <h3 className="min-w-0 text-sm font-medium leading-snug text-muted-foreground">
              {candidate.title}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Not a reviewable lead · {sourceText}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {truncate(candidate.description || candidate.rawContent, 320)}
          </p>
        </div>
        {candidate.url ? (
          <p
            className="max-w-full break-all font-mono text-[11px] leading-5 text-warning"
            title={candidate.url}
          >
            Filtered URL: {truncate(candidate.url, 140)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Meta({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface/40 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 truncate font-medium", className)}>{value}</div>
    </div>
  );
}
