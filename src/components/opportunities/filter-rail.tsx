"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPPORTUNITY_STATUSES } from "@/lib/types";
import { STATUS_META } from "@/lib/display";

type TriState = "any" | "yes" | "no";

const ANY = "any";

export function FilterRail({
  sources,
  basePath,
}: {
  sources: { id: string; name: string }[];
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const target = basePath ?? pathname;

  // Local mirror for the debounced text field.
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");
  const [budgetMax, setBudgetMax] = React.useState(searchParams.get("budgetMax") ?? "");
  const [scoreMin, setScoreMin] = React.useState<number>(
    Number(searchParams.get("scoreMin") ?? "0") || 0,
  );

  const selectedStatuses = React.useMemo(
    () => new Set(searchParams.getAll("status").flatMap((v) => v.split(",")).filter(Boolean)),
    [searchParams],
  );

  const push = React.useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page"); // any filter change resets pagination
      const qs = params.toString();
      router.push(qs ? `${target}?${qs}` : target);
    },
    [router, searchParams, target],
  );

  const setParam = React.useCallback(
    (key: string, value: string | null | undefined) => {
      push((p) => {
        if (value == null || value === "") p.delete(key);
        else p.set(key, value);
      });
    },
    [push],
  );

  // Debounced text search.
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam("q", q || null), 350);
    return () => clearTimeout(t);
  }, [q, searchParams, setParam]);

  // Debounced budget input.
  React.useEffect(() => {
    const current = searchParams.get("budgetMax") ?? "";
    if (budgetMax === current) return;
    const t = setTimeout(() => setParam("budgetMax", budgetMax || null), 350);
    return () => clearTimeout(t);
  }, [budgetMax, searchParams, setParam]);

  function toggleStatus(status: string, checked: boolean) {
    push((p) => {
      const next = new Set(selectedStatuses);
      if (checked) next.add(status);
      else next.delete(status);
      p.delete("status");
      if (next.size) p.set("status", [...next].join(","));
    });
  }

  function commitScoreMin(value: number) {
    setParam("scoreMin", value > 0 ? String(value) : null);
  }

  function triValue(key: string): TriState {
    const v = searchParams.get(key);
    if (v === "true") return "yes";
    if (v === "false") return "no";
    return "any";
  }

  function setTri(key: string, v: TriState) {
    setParam(key, v === "yes" ? "true" : v === "no" ? "false" : null);
  }

  function clearAll() {
    setQ("");
    setBudgetMax("");
    setScoreMin(0);
    router.push(target);
  }

  async function saveSearch() {
    const name = window.prompt("Name this saved search");
    if (!name) return;
    const filters: Record<string, unknown> = {};
    searchParams.forEach((value, key) => {
      const existing = filters[key];
      if (existing == null) filters[key] = value;
      else if (Array.isArray(existing)) (existing as string[]).push(value);
      else filters[key] = [existing as string, value];
    });
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filters }),
      });
      if (!res.ok) throw new Error("Failed to save search");
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to save search");
    }
  }

  const applicationRoute = searchParams.get("applicationRoute") ?? ANY;
  const sourceValue = searchParams.get("source") ?? ANY;
  const sortValue = searchParams.get("sort") ?? "score";
  const activeOnly = searchParams.get("activeOnly") === "true";

  return (
    <Card className="sticky top-4">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">Filters</CardTitle>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <RotateCcw className="h-3.5 w-3.5" />
          Clear all
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Search */}
        <div className="space-y-1.5">
          <Label htmlFor="filter-q">Search</Label>
          <Input
            id="filter-q"
            placeholder="Title, org, summary…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Separator />

        {/* Status */}
        <div className="space-y-2">
          <Label>Status</Label>
          <div className="grid grid-cols-2 gap-2">
            {OPPORTUNITY_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedStatuses.has(status)}
                  onCheckedChange={(c) => toggleStatus(status, c === true)}
                />
                <span>{STATUS_META[status].label}</span>
              </label>
            ))}
          </div>
        </div>

        <Separator />

        {/* Score min */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Minimum score</Label>
            <span className="tnum text-sm text-muted-foreground">{scoreMin}</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[scoreMin]}
            onValueChange={(v) => setScoreMin(v[0] ?? 0)}
            onValueCommit={(v) => commitScoreMin(v[0] ?? 0)}
          />
        </div>

        {/* Budget max */}
        <div className="space-y-1.5">
          <Label htmlFor="filter-budget">Max budget (DKK)</Label>
          <Input
            id="filter-budget"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="e.g. 100000"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
          />
        </div>

        <Separator />

        {/* Active only */}
        <div className="flex items-center justify-between">
          <Label htmlFor="filter-active">Active only</Label>
          <Switch
            id="filter-active"
            checked={activeOnly}
            onCheckedChange={(c) => setParam("activeOnly", c ? "true" : null)}
          />
        </div>

        {/* Has budget */}
        <div className="space-y-1.5">
          <Label>Has budget</Label>
          <Select value={triValue("hasBudget")} onValueChange={(v) => setTri("hasBudget", v as TriState)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Application route */}
        <div className="space-y-1.5">
          <Label>Application route</Label>
          <Select
            value={applicationRoute}
            onValueChange={(v) => setParam("applicationRoute", v === ANY ? null : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="DIRECT">Direct</SelectItem>
              <SelectItem value="APPLICATION">Application</SelectItem>
              <SelectItem value="UNKNOWN">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Source */}
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select
            value={sourceValue}
            onValueChange={(v) => setParam("source", v === ANY ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any source</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Sort */}
        <div className="space-y-1.5">
          <Label>Sort by</Label>
          <Select value={sortValue} onValueChange={(v) => setParam("sort", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score</SelectItem>
              <SelectItem value="deadline">Deadline</SelectItem>
              <SelectItem value="created">Newest</SelectItem>
              <SelectItem value="budget">Budget</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" className="w-full" onClick={saveSearch}>
          <Bookmark className="h-4 w-4" />
          Save search
        </Button>
      </CardContent>
    </Card>
  );
}
