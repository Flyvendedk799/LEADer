"use client";
import { EvidenceProvenance } from "./evidence-provenance";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Inbox,
  Loader2,
  Check,
  X,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScoreBadge } from "@/components/shared/score-badge";
import { cn, formatBudget, formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/empty-state";

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

export function filterReviewLeads<
  T extends {
    title: string;
    organization?: string | null;
    description?: string | null;
    lane?: { name: string } | null;
    pursuitScore?: number | null;
  },
>(
  leads: T[],
  filters: {
    searchQuery?: string;
    selectedLane?: string;
    minScore?: string;
  },
): T[] {
  const { searchQuery = "", selectedLane = "ALL", minScore = "ALL" } = filters;
  const q = searchQuery.toLowerCase().trim();
  const threshold = minScore !== "ALL" ? Number(minScore) : null;

  return leads.filter((lead) => {
    if (selectedLane !== "ALL" && lead.lane?.name !== selectedLane) {
      return false;
    }
    if (threshold !== null && (lead.pursuitScore ?? 0) < threshold) {
      return false;
    }
    if (q) {
      const matchesTitle = lead.title.toLowerCase().includes(q);
      const matchesOrg = lead.organization?.toLowerCase().includes(q) ?? false;
      const matchesDesc = lead.description?.toLowerCase().includes(q) ?? false;
      const matchesLane = lead.lane?.name.toLowerCase().includes(q) ?? false;
      if (!matchesTitle && !matchesOrg && !matchesDesc && !matchesLane) {
        return false;
      }
    }
    return true;
  });
}

export function ReviewInbox({
  leads,
  workspace,
}: {
  leads: Lead[];
  workspace: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState<"save" | "dismiss" | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLane, setSelectedLane] = useState<string>("ALL");
  const [minScore, setMinScore] = useState<string>("ALL");

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
      setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
      toast.success(
        action === "save" ? "Added to your pipeline" : "Lead dismissed",
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("leader:counts-refresh"));
      }
      router.refresh();
    } catch (error) {
      toast.error("Couldn't update lead", (error as Error).message);
    } finally {
      setPending(null);
    }
  }

  const visible = leads.filter((lead) => !removed.includes(lead.id));

  // Extract available lanes from visible leads
  const availableLanes = useMemo(() => {
    const lanes = new Set<string>();
    for (const lead of visible) {
      if (lead.lane?.name) {
        lanes.add(lead.lane.name);
      }
    }
    return Array.from(lanes).sort();
  }, [visible]);

  // Apply filters
  const filteredLeads = useMemo(() => {
    return filterReviewLeads(visible, { searchQuery, selectedLane, minScore });
  }, [visible, selectedLane, minScore, searchQuery]);

  const filteredIds = filteredLeads.map((l) => l.id);
  const selectedFilteredIds = selectedIds.filter((id) => filteredIds.includes(id));
  const allFilteredSelected =
    filteredLeads.length > 0 && selectedFilteredIds.length === filteredLeads.length;

  function toggleSelectAll() {
    if (allFilteredSelected) {
      // Unselect only the currently filtered leads
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      // Add all currently filtered leads to selection
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  }

  function toggleSelectLead(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function actBulk(action: "save" | "dismiss") {
    // Process only leads that are selected and match the current active filters
    const targetIds = [...selectedFilteredIds];
    if (targetIds.length === 0) return;

    setBulkPending(action);
    try {
      const res = await fetch("/api/discovery/candidates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Please try again.",
        );
      }
      const processedIds = Array.isArray(data.results)
        ? (data.results.map((r: { id: string }) => r.id) as string[])
        : targetIds;

      setRemoved((prev) => [...prev, ...processedIds]);
      setSelectedIds((prev) =>
        prev.filter((id) => !processedIds.includes(id)),
      );
      toast.success(
        action === "save"
          ? `Added ${data.count ?? processedIds.length} leads to your pipeline`
          : `Dismissed ${data.count ?? processedIds.length} leads`,
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("leader:counts-refresh"));
      }
      router.refresh();
    } catch (error) {
      toast.error(
        action === "save"
          ? "Couldn't add leads to deals"
          : "Couldn't dismiss leads",
        (error as Error).message,
      );
      // Saves commit individually; a failed batch can still have changed leads.
      window.dispatchEvent(new Event("leader:counts-refresh"));
      router.refresh();
    } finally {
      setBulkPending(null);
    }
  }

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || selectedLane !== "ALL" || minScore !== "ALL";

  function resetFilters() {
    setSearchQuery("");
    setSelectedLane("ALL");
    setMinScore("ALL");
  }

  if (!visible.length)
    return (
      <EmptyState
        icon={Inbox}
        title="Inbox zero"
        description="Review new leads here and add the promising ones to your pipeline."
      >
        <Button asChild>
          <Link href={`/discover?workspace=${workspace}`}>
            Find leads
          </Link>
        </Button>
      </EmptyState>
    );

  return (
    <div className="space-y-4">
      {/* Search, Lane, and Score Filters */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-card p-3 sm:gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search leads by title, org, or scope..."
            aria-label="Search leads"
            className="h-11 min-h-11 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <select
          value={selectedLane}
          onChange={(e) => setSelectedLane(e.target.value)}
          aria-label="Filter by lane"
          className="h-11 min-h-11 rounded-md border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="ALL">All lanes</option>
          {availableLanes.map((lane) => (
            <option key={lane} value={lane}>
              {lane}
            </option>
          ))}
        </select>

        <select
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          aria-label="Filter by score"
          className="h-11 min-h-11 rounded-md border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="ALL">All scores</option>
          <option value="80">Score 80+ (High)</option>
          <option value="60">Score 60+ (Good)</option>
          <option value="40">Score 40+ (Moderate)</option>
        </select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-11 min-h-11 px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </Button>
        )}
      </div>

      {/* Select All and Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium">
          <div className="flex min-h-11 min-w-11 items-center justify-center -ml-2">
            <Checkbox
              checked={
                allFilteredSelected
                  ? true
                  : selectedFilteredIds.length > 0
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={toggleSelectAll}
              aria-label={allFilteredSelected ? "Deselect all" : "Select all"}
            />
          </div>
          <span>{allFilteredSelected ? "Deselect all" : "Select all"}</span>
          <span className="text-xs text-muted-foreground">
            ({filteredLeads.length})
          </span>
        </label>
        {selectedFilteredIds.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedFilteredIds.length} of {filteredLeads.length} selected
          </span>
        )}
      </div>

      {/* Sticky Bulk Action Bar */}
      {selectedFilteredIds.length > 0 && (
        <aside
          aria-label="Bulk actions"
          className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-background/95 p-3 shadow-lg backdrop-blur sm:px-5"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">
              {selectedFilteredIds.length} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkPending !== null}
              onClick={() =>
                setSelectedIds((prev) =>
                  prev.filter((id) => !filteredIds.includes(id)),
                )
              }
              className="min-h-11 px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={bulkPending !== null || pending !== null}
              onClick={() => actBulk("save")}
              className="min-h-11 px-3"
            >
              {bulkPending === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Add to deals
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkPending !== null || pending !== null}
              onClick={() => actBulk("dismiss")}
              className="min-h-11 px-3"
            >
              {bulkPending === "dismiss" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Dismiss
            </Button>
          </div>
        </aside>
      )}

      {/* Filtered empty state */}
      {filteredLeads.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No leads match your active filters
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try adjusting your search query, lane, or minimum score.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            className="mt-4"
          >
            Clear filters
          </Button>
        </div>
      )}

      {/* Leads list */}
      {filteredLeads.map((lead) => (
        <article
          id={lead.id}
          key={lead.id}
          className={cn(
            "scroll-mt-6 rounded-xl border bg-card p-5 sm:p-6 transition-colors",
            selectedIds.includes(lead.id) && "border-primary/50 bg-primary/[0.02]",
          )}
        >
          <div className="flex items-start gap-2">
            <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center shrink-0 -mt-1 -ml-1.5">
              <Checkbox
                checked={selectedIds.includes(lead.id)}
                onCheckedChange={() => toggleSelectLead(lead.id)}
                aria-label={`Select ${lead.title}`}
              />
            </label>
            <div className="min-w-0 flex-1">
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
                  disabled={pending !== null || bulkPending !== null}
                  onClick={() => act(lead.id, "save")}
                  className="min-h-11 px-3"
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
                  disabled={pending !== null || bulkPending !== null}
                  onClick={() => act(lead.id, "dismiss")}
                  className="min-h-11 px-3"
                >
                  <X className="h-4 w-4" />
                  Dismiss
                </Button>
                {lead.url && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-11 px-3 sm:ml-auto"
                  >
                    <a href={lead.url} target="_blank" rel="noreferrer">
                      Check source <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
