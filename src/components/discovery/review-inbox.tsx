"use client";
import { EvidenceProvenance } from "./evidence-provenance";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ExternalLink,
  Inbox,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/shared/score-badge";
import { formatBudget, formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Lead = {
  id: string;
  title: string;
  organization: string | null;
  description: string | null;
  url: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  pursuitScore: number | null;
  deadline: string | Date | null;
  lane: { name: string } | null;
  evidence: {
    id: string;
    snippet: string;
    metadata?: unknown;
    url?: string | null;
  }[];
  reasons: string[];
};
export function ReviewInbox({
  leads,
  workspace,
}: {
  leads: Lead[];
  workspace: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  async function act(id: string, action: "save" | "dismiss") {
    setPending(id);
    try {
      const res = await fetch(`/api/discovery/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          typeof data.error === "string" ? data.error : "Please try again.",
        );
      setRemoved((ids) => [...ids, id]);
      toast.success(
        action === "save" ? "Added to your pipeline" : "Lead dismissed",
      );
      router.refresh();
    } catch (error) {
      toast.error("Couldn't update lead", (error as Error).message);
    } finally {
      setPending(null);
    }
  }
  const visible = leads.filter((lead) => !removed.includes(lead.id));
  if (!visible.length)
    return (
      <div className="rounded-xl border bg-card p-12 text-center">
        <Inbox className="mx-auto mb-5 h-10 w-10 text-primary" />
        <h2 className="text-lg font-semibold">A clear inbox. A fresh start.</h2>
        <p className="mx-auto mb-6 mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          New discoveries collect here until you decide. Find leads, check the
          evidence, then add the ones worth pursuing to your deals.
        </p>
        <Button asChild>
          <Link href={`/discover?workspace=${workspace}`}>
            Find your next lead <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  return (
    <div className="space-y-4">
      {visible.map((lead) => (
        <article
          id={lead.id}
          key={lead.id}
          className="scroll-mt-6 rounded-xl border bg-card p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium text-primary">
                {lead.lane?.name || "Discovery"}{" "}
                {lead.organization ? ` · ${lead.organization}` : ""}
              </p>
              <h2 className="text-lg font-semibold leading-7">{lead.title}</h2>
            </div>
            <ScoreBadge score={lead.pursuitScore} showLabel />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Check buyer, scope, budget and deadline against the source. Match
            scores are estimates.
          </p>
          {lead.description && (
            <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">
              {lead.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <span className="rounded-md bg-muted px-2.5 py-1.5">
              {formatBudget(
                lead.budgetMin,
                lead.budgetMax,
                lead.currency || "DKK",
              )}
            </span>
            <span className="rounded-md bg-muted px-2.5 py-1.5">
              {lead.deadline
                ? `Deadline ${formatDate(lead.deadline)}`
                : "No deadline confirmed"}
            </span>
          </div>
          {(lead.evidence.length > 0 || lead.reasons.length > 0) && (
            <details className="mt-4 rounded-lg border p-3 text-sm">
              <summary className="font-medium">
                Evidence & match reasoning
              </summary>
              <div className="mt-3 space-y-3 text-muted-foreground">
                {lead.evidence.map((item) => (
                  <div
                    key={item.id}
                    className="border-l-2 border-primary/30 pl-3 leading-6"
                  >
                    <EvidenceProvenance metadata={item.metadata} />
                    {item.snippet}
                  </div>
                ))}
                {lead.reasons.map((reason, i) => (
                  <p key={i}>{reason}</p>
                ))}
              </div>
            </details>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              size="sm"
              disabled={pending !== null}
              onClick={() => act(lead.id, "save")}
            >
              {pending === lead.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Add to deals
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending !== null}
              onClick={() => act(lead.id, "dismiss")}
            >
              <X className="h-4 w-4" />
              Dismiss
            </Button>
            {lead.url && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="sm:ml-auto"
              >
                <a href={lead.url} target="_blank" rel="noreferrer">
                  Check source <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
