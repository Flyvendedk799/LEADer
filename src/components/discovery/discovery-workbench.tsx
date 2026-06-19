"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Radar,
  Search,
  SlidersHorizontal,
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

export function DiscoveryWorkbench({
  initialWorkspace = "DK",
}: {
  initialWorkspace?: Workspace;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState<string>(DEFAULT_QUERY);
  const [workspace, setWorkspace] = React.useState<Workspace>(initialWorkspace);
  const [provider, setProvider] = React.useState<Provider>("auto");
  const [maxResults, setMaxResults] = React.useState("12");
  const [includeWeb, setIncludeWeb] = React.useState(true);
  const [includeSources, setIncludeSources] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<DiscoverySearchResult | null>(null);
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});

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
            <div className="flex flex-wrap gap-2">
              {DISCOVERY_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant={preset.query === query ? "default" : "outline"}
                  onClick={() => setQuery(preset.query)}
                >
                  {preset.label}
                </Button>
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
                    onSave={() => saveCandidate(candidate)}
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
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium">Queries</p>
              <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                {result.queries.map((q) => (
                  <li key={q} className="rounded bg-surface/60 p-2">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  saving,
  onSave,
}: {
  candidate: DiscoveryCandidateDto;
  saving: boolean;
  onSave: () => void;
}) {
  const saved = candidate.alreadySaved;
  const deadlineTone =
    candidate.deadline && new Date(candidate.deadline).getTime() >= Date.now()
      ? "text-success"
      : candidate.deadline
        ? "text-muted-foreground"
        : "text-muted-foreground";

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
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
        {truncate(candidate.description || candidate.rawContent, 420)}
      </p>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Meta label="Budget" value={formatBudget(candidate.budgetMin, candidate.budgetMax, candidate.currency || "DKK")} />
        <Meta
          label="Deadline"
          value={`${formatDate(candidate.deadline)} · ${relativeDeadline(candidate.deadline)}`}
          className={deadlineTone}
        />
        <Meta label="Route" value={candidate.applicationRoute.toLowerCase()} />
        <Meta label="Category" value={candidate.category || "Uncategorised"} />
      </div>

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
        {saved ? (
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
    <div className="rounded-md border border-border bg-surface/40 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 truncate font-medium", className)}>{value}</div>
    </div>
  );
}
