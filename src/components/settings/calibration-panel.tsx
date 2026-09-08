"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Loader2,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ScoringCalibrationModel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface CalibrationResponse {
  model: ScoringCalibrationModel;
  samplesNeeded: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Correlation → plain words, so the number is never the only explanation. */
function strengthLabel(correlation: number): string {
  const magnitude = Math.abs(correlation);
  if (magnitude < 0.15) return "no clear link";
  if (magnitude < 0.35) return "weak link";
  if (magnitude < 0.6) return "clear link";
  return "strong link";
}

function DirectionIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <ArrowUp className="h-3.5 w-3.5 text-success" />;
  if (direction === "down") return <ArrowDown className="h-3.5 w-3.5 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

/** A signed bar centred on zero — left is "predicts discards", right "predicts wins". */
function CorrelationBar({ value }: { value: number }) {
  const width = Math.min(50, Math.abs(value) * 50);
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className={value >= 0 ? "absolute inset-y-0 bg-success" : "absolute inset-y-0 bg-destructive"}
        style={
          value >= 0
            ? { left: "50%", width: `${width}%` }
            : { right: "50%", width: `${width}%` }
        }
      />
    </div>
  );
}

export function CalibrationPanel() {
  const router = useRouter();
  const [data, setData] = React.useState<CalibrationResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [relearning, setRelearning] = React.useState(false);
  const [rescored, setRescored] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/calibration");
        if (!res.ok) throw new Error("Could not load calibration");
        const json = (await res.json()) as CalibrationResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function relearn() {
    setRelearning(true);
    setError(null);
    setRescored(null);
    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rescore: true }),
      });
      if (!res.ok) throw new Error("Could not relearn from outcomes");
      const json = (await res.json()) as CalibrationResponse & { rescored: number };
      setData({ model: json.model, samplesNeeded: json.samplesNeeded });
      setRescored(json.rescored);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRelearning(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading your outcomes…
        </CardContent>
      </Card>
    );
  }

  const model = data?.model;
  const movedCriteria = model?.criteria.filter((c) => c.direction !== "flat") ?? [];
  const goodFeatures = model?.features.filter((f) => f.direction === "up").slice(0, 8) ?? [];
  const badFeatures = model?.features.filter((f) => f.direction === "down").slice(0, 8) ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Learned from your outcomes
          </CardTitle>
          <CardDescription>
            Every lead you win, apply to, or archive is a verdict. LEADer reads those
            verdicts and re-ranks future leads to look more like the work you actually
            take on — and less like the work you throw away.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-2xl font-semibold tnum">{model?.rawSampleCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Decisions learned from</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tnum">{pct(model?.confidence ?? 0)}</div>
              <div className="text-xs text-muted-foreground">Confidence in the signal</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tnum">{movedCriteria.length}</div>
              <div className="text-xs text-muted-foreground">Criteria retuned</div>
            </div>
          </div>

          {model?.outcomeCounts && Object.keys(model.outcomeCounts).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(model.outcomeCounts).map(([status, count]) => (
                <Badge key={status} variant="muted">
                  {status.toLowerCase()} · {count}
                </Badge>
              ))}
            </div>
          ) : null}

          {model?.insufficientData ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Not enough evidence yet.</p>
              <p className="mt-1">
                Scoring is running on the default weights, untouched. Move roughly{" "}
                <span className="font-medium text-foreground">
                  {data?.samplesNeeded ?? 4} more
                </span>{" "}
                leads to won, applied, or archived and LEADer will start ranking from your
                own track record instead of its assumptions.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Learning is shrunk toward the defaults in proportion to how much evidence
              there is, so early outcomes nudge the ranking rather than swing it.
            </p>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {rescored != null ? (
            <p className="text-sm text-success">
              Relearned and rescored {rescored} {rescored === 1 ? "lead" : "leads"}.
            </p>
          ) : null}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {model?.computedAt
              ? `Last learned ${new Date(model.computedAt).toLocaleString("da-DK")}`
              : "Never learned"}
          </span>
          <Button onClick={relearn} disabled={relearning}>
            {relearning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Relearn &amp; rescore
          </Button>
        </CardFooter>
      </Card>

      {model && !model.insufficientData ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What predicts your wins</CardTitle>
              <CardDescription>
                How strongly each criterion tracked the leads you converted, and the
                weight it now carries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {model.criteria.map((c) => (
                <div key={c.criterion} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <DirectionIcon direction={c.direction} />
                      <span className="font-medium">{c.label}</span>
                    </span>
                    <span className="tnum text-xs text-muted-foreground">
                      {pct(c.baseWeight)} → {pct(c.learnedWeight)}
                    </span>
                  </div>
                  <CorrelationBar value={c.correlation} />
                  <p className="text-xs text-muted-foreground">
                    {strengthLabel(c.correlation)} · r = {c.correlation.toFixed(2)} across{" "}
                    {c.samples} {c.samples === 1 ? "decision" : "decisions"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {goodFeatures.length || badFeatures.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What converts, concretely</CardTitle>
                <CardDescription>
                  Specific sources, categories and words that separated your wins from
                  your discards. These adjust a lead&apos;s score by up to 12 points.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-success">
                    <TrendingUp className="h-4 w-4" />
                    Worth more to you
                  </h4>
                  {goodFeatures.length ? (
                    goodFeatures.map((f) => (
                      <div
                        key={f.feature}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">{f.label}</span>
                        <span className="tnum shrink-0 text-xs text-muted-foreground">
                          +{f.lift.toFixed(2)} · {f.samples}×
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing stands out yet.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <TrendingDown className="h-4 w-4" />
                    Worth less to you
                  </h4>
                  {badFeatures.length ? (
                    badFeatures.map((f) => (
                      <div
                        key={f.feature}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">{f.label}</span>
                        <span className="tnum shrink-0 text-xs text-muted-foreground">
                          {f.lift.toFixed(2)} · {f.samples}×
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing stands out yet.</p>
                  )}
                </div>
              </CardContent>
              <Separator />
              <CardFooter className="pt-4">
                <p className="text-xs text-muted-foreground">
                  A feature needs at least two sightings to count, and its effect is
                  shrunk by how often you have seen it — so one lucky win never rewrites
                  your ranking.
                </p>
              </CardFooter>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
