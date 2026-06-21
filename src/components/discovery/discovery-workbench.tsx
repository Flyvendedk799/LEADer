"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Radar,
  Search,
  Sparkles,
  SlidersHorizontal,
  Target,
  ThumbsDown,
} from "lucide-react";

import type { DiscoveryCandidateDto, DiscoverySearchResult } from "@/lib/discovery";
import { DISCOVERY_PRESETS } from "@/lib/discovery/presets";
import type { Workspace } from "@/lib/types";
import { cn, formatBudget, formatDate, relativeDeadline, truncate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/shared/score-badge";
import { toast } from "@/hooks/use-toast";

const DEFAULT_QUERY = DISCOVERY_PRESETS[0].query;

type Provider = "auto" | "tavily" | "brave" | "serper" | "none";
type ResultKind = "all" | "opportunities" | "sources";

export function DiscoveryWorkbench({
  initialWorkspace = "DK",
}: {
  initialWorkspace?: Workspace;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState<string>(DEFAULT_QUERY);
  const [workspace, setWorkspace] = React.useState<Workspace>(initialWorkspace);
  const [provider, setProvider] = React.useState<Provider>("auto");
  const [resultKind, setResultKind] = React.useState<ResultKind>("all");
  const [maxResults, setMaxResults] = React.useState("12");
  const [includeWeb, setIncludeWeb] = React.useState(true);
  const [includeSources, setIncludeSources] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<DiscoverySearchResult | null>(null);
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  const [savingSource, setSavingSource] = React.useState<Record<string, boolean>>({});
  const [markingNonLead, setMarkingNonLead] = React.useState<Record<string, boolean>>({});
  const activePreset = DISCOVERY_PRESETS.find((preset) => preset.query === query);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/discover/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          workspace,
          provider,
          resultKind,
          includeWeb,
          includeSources,
          maxResults: Number(maxResults) || 12,
        }),
      });
      const data = (await res.json()) as DiscoverySearchResult | { error?: string };
      if (!res.ok) throw new Error("error" in data ? data.error : "Discovery failed");
      setResult(data as DiscoverySearchResult);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Discovery failed";
      toast.error("Discovery failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function saveCandidate(candidate: DiscoveryCandidateDto) {
    setSaving((s) => ({ ...s, [candidate.id]: true }));
    try {
      const res = await fetch("/api/discover/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, candidate }),
      });
      const data = (await res.json()) as {
        opportunity?: { id: string; title: string };
        created?: boolean;
        error?: string;
      };
      if (!res.ok || !data.opportunity) throw new Error(data.error || "Save failed");
      toast.success(
        data.created ? "Lead saved" : "Already in pipeline",
        data.opportunity.title,
      );
      setResult((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.map((c) =>
                c.id === candidate.id
                  ? { ...c, alreadySaved: { id: data.opportunity!.id, title: data.opportunity!.title } }
                  : c,
              ),
            }
          : current,
      );
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed";
      toast.error("Could not save lead", message);
    } finally {
      setSaving((s) => ({ ...s, [candidate.id]: false }));
    }
  }

  async function saveSource(candidate: DiscoveryCandidateDto) {
    if (!candidate.url) return;
    setSavingSource((s) => ({ ...s, [candidate.id]: true }));
    try {
      const res = await fetch("/api/discover/save-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, candidate }),
      });
      const data = (await res.json()) as {
        source?: { id: string; name: string };
        created?: boolean;
        error?: string;
      };
      if (!res.ok || !data.source) throw new Error(data.error || "Save source failed");
      toast.success(
        data.created ? "Source saved" : "Source already saved",
        data.source.name,
      );
      setResult((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.map((c) =>
                c.id === candidate.id
                  ? { ...c, alreadySavedSource: { id: data.source!.id, name: data.source!.name } }
                  : c,
              ),
            }
          : current,
      );
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save source failed";
      toast.error("Could not save source", message);
    } finally {
      setSavingSource((s) => ({ ...s, [candidate.id]: false }));
    }
  }

  async function markNonLead(candidate: DiscoveryCandidateDto) {
    setMarkingNonLead((s) => ({ ...s, [candidate.id]: true }));
    try {
      const res = await fetch("/api/discover/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate,
          feedback: "NON_LEAD",
          reason: "Marked as non-lead from Discover review",
        }),
      });
      const data = (await res.json()) as { feedback?: { id: string }; error?: string };
      if (!res.ok || !data.feedback) throw new Error(data.error || "Feedback failed");
      setResult((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.filter((c) => c.id !== candidate.id),
            }
          : current,
      );
      toast.success("Marked as non-lead", candidate.title);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Feedback failed";
      toast.error("Could not mark non-lead", message);
    } finally {
      setMarkingNonLead((s) => ({ ...s, [candidate.id]: false }));
    }
  }

  const candidates = result?.candidates ?? [];

  return (
    <div className="space-y-5">
      <form
        onSubmit={runSearch}
        className="rounded-lg border border-border bg-card p-4 shadow-sm"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radar className="h-4 w-4 text-primary" />
              Search mission
            </div>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-28 resize-y"
              placeholder="Describe the kind of funded software work you want to find..."
            />
            <div className="grid gap-2 md:grid-cols-2">
              {DISCOVERY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(
                    "rounded-md border border-border bg-surface/35 p-3 text-left transition hover:border-primary/50 hover:bg-surface/65",
                    preset.id === activePreset?.id && "border-primary bg-primary/10",
                  )}
                  onClick={() => setQuery(preset.query)}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Target className="h-4 w-4 text-primary" />
                    {preset.label}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {preset.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {preset.focus.slice(0, 4).map((term) => (
                      <span key={term} className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {term}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-md border border-border bg-surface/40 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              Scope
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Workspace</Label>
                <Select value={workspace} onValueChange={(v) => setWorkspace(v as Workspace)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DK">Denmark</SelectItem>
                    <SelectItem value="GLOBAL">Global</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discover-max">Results</Label>
                <Input
                  id="discover-max"
                  type="number"
                  min={4}
                  max={30}
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="tavily">Tavily</SelectItem>
                  <SelectItem value="brave">Brave</SelectItem>
                  <SelectItem value="serper">Serper</SelectItem>
                  <SelectItem value="none">Sources only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Result type</Label>
              <Select value={resultKind} onValueChange={(v) => setResultKind(v as ResultKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Begge</SelectItem>
                  <SelectItem value="opportunities">Udbud</SelectItem>
                  <SelectItem value="sources">Udbudskilde</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="include-web">Web</Label>
              <Switch id="include-web" checked={includeWeb} onCheckedChange={setIncludeWeb} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="include-sources">Sources</Label>
              <Switch id="include-sources" checked={includeSources} onCheckedChange={setIncludeSources} />
            </div>
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Find leads
            </Button>
          </div>
        </div>
      </form>

      {result && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.providerConfigured
                    ? `${result.provider} search`
                    : "source scan"}{" "}
                  · {result.sourceScanCount} saved sources scanned
                </p>
              </div>
            </div>

            {candidates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm font-medium">No candidates found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a broader query or add a search API key.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    saving={saving[candidate.id] === true}
                    savingSource={savingSource[candidate.id] === true}
                    markingNonLead={markingNonLead[candidate.id] === true}
                    onSave={() => saveCandidate(candidate)}
                    onSaveSource={() => saveSource(candidate)}
                    onMarkNonLead={() => markNonLead(candidate)}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-3">
            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-warning">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4" />
                  Warnings
                </div>
                <ul className="space-y-1">
                  {result.warnings.slice(0, 5).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <SearchPlanPanel result={result} />
          </aside>
        </div>
      )}
    </div>
  );
}

function SearchPlanPanel({ result }: { result: DiscoverySearchResult }) {
  const plan = result.searchPlan;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        Search plan
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {plan.rationale}
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        <Badge variant={plan.usedAi ? "default" : "secondary"}>
          {plan.usedAi ? "AI planned" : "Smart fallback"}
        </Badge>
        {plan.focusTerms.slice(0, 6).map((term) => (
          <Badge key={term} variant="secondary">
            {term}
          </Badge>
        ))}
      </div>
      {plan.avoidTerms.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Avoiding</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {plan.avoidTerms.slice(0, 6).map((term) => (
              <span key={term} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {term}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Queries</p>
        <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
          {result.queries.map((q) => (
            <li key={q} className="rounded bg-surface/60 p-2 leading-5">
              {q}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  saving,
  savingSource,
  markingNonLead,
  onSave,
  onSaveSource,
  onMarkNonLead,
}: {
  candidate: DiscoveryCandidateDto;
  saving: boolean;
  savingSource: boolean;
  markingNonLead: boolean;
  onSave: () => void;
  onSaveSource: () => void;
  onMarkNonLead: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const saved = candidate.alreadySaved;
  const savedSource = candidate.alreadySavedSource;
  const isSource = candidate.candidateKind === "source";
  const summary = candidate.summaryDa || candidate.description || candidate.rawContent || "";
  const details = candidate.detailText || candidate.rawContent || candidate.description || "";
  const attachments = candidate.attachments ?? [];
  const deadlineTone =
    candidate.deadline && new Date(candidate.deadline).getTime() >= Date.now()
      ? "text-success"
      : candidate.deadline
        ? "text-muted-foreground"
        : "text-muted-foreground";
  const freshnessTone =
    candidate.freshness === "active"
      ? "text-success"
      : candidate.freshness === "expired" || candidate.freshness === "stale"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isSource ? "outline" : "secondary"} className="gap-1">
              {isSource ? <Database className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {isSource ? "Udbudskilde" : "Udbud"}
            </Badge>
            <h2 className="min-w-0 text-base font-semibold leading-snug">
              {candidate.url ? (
                <a
                  href={candidate.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary"
                >
                  {candidate.title}
                </a>
              ) : (
                candidate.title
              )}
            </h2>
            {candidate.url && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {candidate.sourceName} · {candidate.provider} · {candidate.sourceKind === "source-scan" ? "saved source" : "web"}
          </p>
        </div>
        <ScoreBadge score={candidate.matchScore} size="lg" showLabel />
      </div>

      {candidate.signals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {candidate.signals.map((signal) => (
            <Badge key={signal} variant="secondary">
              {signal}
            </Badge>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {truncate(summary, 520)}
      </p>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Meta
          label={isSource ? "Kind" : "Budget"}
          value={
            isSource
              ? "Reusable source"
              : formatBudget(candidate.budgetMin, candidate.budgetMax, candidate.currency || "DKK")
          }
        />
        <Meta
          label={isSource ? "Freshness" : "Deadline"}
          value={
            isSource
              ? freshnessLabel(candidate.freshness)
              : `${formatDate(candidate.deadline)} · ${relativeDeadline(candidate.deadline)}`
          }
          className={isSource ? freshnessTone : deadlineTone}
        />
        <Meta
          label={isSource ? "Documents" : "Route"}
          value={isSource ? `${attachments.length} found` : candidate.applicationRoute.toLowerCase()}
        />
        <Meta label="Category" value={candidate.category || "Uncategorised"} />
      </div>

      {(expanded || candidate.priceText || attachments.length > 0) && (
        <div className="mt-4 grid gap-3 rounded-md border border-border bg-surface/35 p-3">
          {candidate.priceText && (
            <div className="text-sm">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Prisinfo</div>
              <p className="mt-1 leading-6 text-muted-foreground">{candidate.priceText}</p>
            </div>
          )}
          {expanded && details && (
            <div className="text-sm">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Detaljer</div>
              <p className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap leading-6 text-muted-foreground">
                {truncate(details, 2200)}
              </p>
            </div>
          )}
          {attachments.length > 0 && (
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Dokumenter</div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <Button key={attachment.url} asChild variant="outline" size="sm">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      download={attachment.kind === "pdf" ? "" : undefined}
                    >
                      {attachment.kind === "pdf" ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      {truncate(attachment.label || attachment.url, 36)}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {candidate.reasons.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            {candidate.reasons.map((reason) => (
              <span key={reason} className="rounded-md bg-surface px-2 py-1 text-xs text-muted-foreground">
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          {candidate.organization || candidate.location || candidate.country ? (
            <span>{[candidate.organization, candidate.location, candidate.country].filter(Boolean).join(" · ")}</span>
          ) : (
            <span>Source result</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(details || attachments.length > 0 || candidate.priceText) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              <BookOpen className="h-4 w-4" />
              {expanded ? "Skjul" : "Læs mere"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={onMarkNonLead}
            disabled={markingNonLead || saving || savingSource}
          >
            {markingNonLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
            Non-lead
          </Button>
          {isSource ? (
            savedSource ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/sources">
                  <Database className="h-4 w-4" />
                  Source saved
                </Link>
              </Button>
            ) : (
              <Button size="sm" onClick={onSaveSource} disabled={savingSource || !candidate.url}>
                {savingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                Save source
              </Button>
            )
          ) : saved ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/opportunities/${saved.id}`}>
                <CheckCircle2 className="h-4 w-4" />
                In pipeline
              </Link>
            </Button>
          ) : (
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save lead
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function freshnessLabel(freshness: DiscoveryCandidateDto["freshness"]): string {
  if (freshness === "active") return "Active";
  if (freshness === "expired") return "Expired";
  if (freshness === "stale") return "Stale";
  return "Unknown";
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
    <div className="rounded-md border border-border bg-surface/40 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 truncate font-medium", className)}>{value}</div>
    </div>
  );
}
