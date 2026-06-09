"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import type { ScoreCriterion, ScoreWeights } from "@/lib/types";
import { CRITERION_LABELS, DEFAULT_WEIGHTS } from "@/lib/scoring";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";

const CRITERIA = Object.keys(DEFAULT_WEIGHTS) as ScoreCriterion[];

/** Weights are stored 0..1; sliders edit them as 0..100 for nicer control. */
function toSliders(w: ScoreWeights): Record<ScoreCriterion, number> {
  const out = {} as Record<ScoreCriterion, number>;
  for (const k of CRITERIA) out[k] = Math.round((w[k] ?? 0) * 100);
  return out;
}

function toWeights(s: Record<ScoreCriterion, number>): ScoreWeights {
  const out = {} as ScoreWeights;
  for (const k of CRITERIA) out[k] = (s[k] ?? 0) / 100;
  return out;
}

export function ScoringWeightsForm({ weights }: { weights: ScoreWeights }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<ScoreCriterion, number>>(
    toSliders({ ...DEFAULT_WEIGHTS, ...weights }),
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [rescoring, setRescoring] = React.useState(false);
  const [rescoredCount, setRescoredCount] = React.useState<number | null>(null);

  const total = React.useMemo(
    () => CRITERIA.reduce((sum, k) => sum + (values[k] ?? 0), 0),
    [values],
  );

  /** Live sum-normalised percentage each weight represents. */
  function normalizedPct(k: ScoreCriterion): number {
    if (total <= 0) return 0;
    return Math.round(((values[k] ?? 0) / total) * 100);
  }

  function setOne(k: ScoreCriterion, v: number) {
    setValues((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
    setRescoredCount(null);
  }

  function resetDefaults() {
    setValues(toSliders(DEFAULT_WEIGHTS));
    setSaved(false);
    setRescoredCount(null);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    setRescoredCount(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoringWeights: toWeights(values) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save weights");
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function rescoreAll() {
    setRescoring(true);
    setError(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Re-scoring failed");
      }
      const body = await res.json().catch(() => ({}));
      // Be tolerant of the score endpoint's response shape.
      const count: number =
        body.count ?? body.updated ?? body.rescored ?? body.total ?? 0;
      setRescoredCount(count);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRescoring(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring weights</CardTitle>
        <CardDescription>
          Tune how each criterion contributes to the 0–100 match score. Weights
          are sum-normalised, so the live percentage shows each criterion&apos;s
          real share — adjust freely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {CRITERIA.map((k) => (
          <div key={k} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {CRITERION_LABELS[k]}
              </span>
              <span className="tnum text-xs text-muted-foreground">
                {normalizedPct(k)}% share
                <span className="ml-2 text-muted-foreground/60">({values[k]})</span>
              </span>
            </div>
            <Slider
              value={[values[k] ?? 0]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setOne(k, v[0] ?? 0)}
              aria-label={CRITERION_LABELS[k]}
            />
          </div>
        ))}

        <Separator />
        <p className="text-xs text-muted-foreground">
          {total <= 0
            ? "All weights are zero — set at least one above zero so scoring has signal."
            : "Shares always sum to 100%. Raw slider values are normalised at scoring time."}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={resetDefaults} disabled={saving}>
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          {saved && (
            <Button
              type="button"
              variant="secondary"
              onClick={rescoreAll}
              disabled={rescoring}
            >
              {rescoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {rescoring ? "Re-scoring…" : "Re-score all opportunities"}
            </Button>
          )}
          {rescoredCount != null && (
            <span className="flex items-center gap-1.5 text-sm text-success" aria-live="polite">
              <Check className="h-4 w-4" />
              {rescoredCount} re-scored
            </span>
          )}
          <Button type="button" onClick={save} disabled={saving || total <= 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save weights"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
