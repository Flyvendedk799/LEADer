"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, BriefcaseBusiness, Database, Loader2, PlayCircle, Sparkles, Target, TimerReset } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  filterWorkflowRecommendationBatch,
  type WorkflowRecommendationBatchAction,
  workflowRecommendationBatchToast,
  workflowRecommendationPresetPayload,
  workflowRecommendationRunPayload,
} from "@/lib/workflows/recommendation-actions";

type WorkflowPlaybook = "daily-sweep" | "pipeline-rescue" | "candidate-harvest" | "operating-day";
type Workspace = "DK" | "GLOBAL";

type WorkflowRunOptions = {
  dailySweep?: {
    includeSources?: boolean;
    includeAlerts?: boolean;
  };
  candidateHarvest?: {
    minScore?: number;
    limit?: number;
  };
  pipelineRescue?: {
    staleDays?: number;
    deadlineDays?: number;
    limit?: number;
  };
  operatingDay?: {
    dailySweep?: boolean;
    candidateHarvest?: boolean;
    pipelineRescue?: boolean;
  };
};

export type WorkflowRecommendationItem = {
  id: string;
  title: string;
  reason: string;
  metric: string;
  playbook: WorkflowPlaybook;
  workspace?: Workspace;
  options?: WorkflowRunOptions;
  tone: "primary" | "warning" | "success" | "default";
  icon: "sparkles" | "target" | "timer" | "database" | "briefcase";
};

type WorkflowRunResponse = {
  run?: {
    id: string;
    status: string;
  };
  error?: unknown;
};

type WorkflowPresetResponse = {
  preset?: {
    id: string;
    name: string;
  };
  error?: unknown;
};

type ErrorResponse = {
  error?: unknown;
};

function Icon({ name }: { name: WorkflowRecommendationItem["icon"] }) {
  const className = "h-4 w-4";
  if (name === "target") return <Target className={className} />;
  if (name === "timer") return <TimerReset className={className} />;
  if (name === "database") return <Database className={className} />;
  if (name === "briefcase") return <BriefcaseBusiness className={className} />;
  return <Sparkles className={className} />;
}

function toneVariant(tone: WorkflowRecommendationItem["tone"]) {
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  if (tone === "primary") return "secondary";
  return "outline";
}

function responseError(data: ErrorResponse | null, fallback: string) {
  return String(data?.error || fallback);
}

async function postJson<T extends ErrorResponse>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !data) {
    throw new Error(responseError(data, fallback));
  }
  return data;
}

export function WorkflowRecommendationPanel({
  recommendations,
}: {
  recommendations: WorkflowRecommendationItem[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function createRecommendationRun(recommendation: WorkflowRecommendationItem) {
    const data = await postJson<WorkflowRunResponse>(
      "/api/workflows/run",
      workflowRecommendationRunPayload(recommendation),
      "Could not queue workflow",
    );
    if (!data.run) {
      throw new Error(responseError(data, "Could not queue workflow"));
    }
    return data.run;
  }

  async function createRecommendationPreset(recommendation: WorkflowRecommendationItem) {
    const data = await postJson<WorkflowPresetResponse>(
      "/api/workflows/presets",
      workflowRecommendationPresetPayload(recommendation),
      "Could not save preset",
    );
    if (!data.preset) {
      throw new Error(responseError(data, "Could not save preset"));
    }
    return data.preset;
  }

  async function queueRecommendation(recommendation: WorkflowRecommendationItem) {
    setBusyId(`queue-${recommendation.id}`);
    try {
      await createRecommendationRun(recommendation);
      toast.success(`${recommendation.title} queued`, "It will keep running in the background.");
      router.refresh();
    } catch (err) {
      toast.error("Could not queue workflow", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function saveRecommendationPreset(recommendation: WorkflowRecommendationItem) {
    setBusyId(`save-${recommendation.id}`);
    try {
      const preset = await createRecommendationPreset(recommendation);
      toast.success("Workflow preset saved", preset.name);
      router.refresh();
    } catch (err) {
      toast.error("Could not save preset", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function runRecommendationBatch(action: WorkflowRecommendationBatchAction) {
    setBusyId(`${action}-all`);
    const batchRecommendations = action === "queue"
      ? filterWorkflowRecommendationBatch(recommendations)
      : recommendations;
    const skipped = recommendations.length - batchRecommendations.length;
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      for (const recommendation of batchRecommendations) {
        try {
          if (action === "queue") {
            await createRecommendationRun(recommendation);
          } else {
            await createRecommendationPreset(recommendation);
          }
          succeeded += 1;
        } catch (err) {
          failed += 1;
          errors.push(err instanceof Error ? err.message : "Try again");
        }
      }

      const summary = workflowRecommendationBatchToast(action, succeeded, failed, skipped);
      const firstError = errors.find(Boolean);
      const description = firstError && failed ? `${summary.description} - ${firstError}` : summary.description;

      if (failed > 0) {
        toast.error(summary.title, description);
      } else {
        toast.success(summary.title, description);
      }

      if (succeeded > 0) {
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  if (recommendations.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No urgent workflow moves right now.</p>;
  }

  const saveAllBusy = busyId === "save-all";
  const queueAllBusy = busyId === "queue-all";

  return (
    <div className="space-y-2">
      {recommendations.length > 1 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(busyId)}
            onClick={() => runRecommendationBatch("save")}
          >
            {saveAllBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
            Save all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(busyId)}
            onClick={() => runRecommendationBatch("queue")}
          >
            {queueAllBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Queue all
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2 lg:grid-cols-2">
        {recommendations.map((recommendation) => {
          const queueBusy = busyId === `queue-${recommendation.id}`;
          const saveBusy = busyId === `save-${recommendation.id}`;
          return (
            <div
              key={recommendation.id}
              className="grid gap-3 rounded-md border border-border bg-surface/40 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon name={recommendation.icon} />
                  </span>
                  <p className="truncate text-sm font-medium">{recommendation.title}</p>
                  <Badge variant={toneVariant(recommendation.tone)}>{recommendation.metric}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{recommendation.reason}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(busyId)}
                  onClick={() => saveRecommendationPreset(recommendation)}
                  className="flex-1 md:flex-none"
                >
                  {saveBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(busyId)}
                  onClick={() => queueRecommendation(recommendation)}
                  className="flex-1 md:flex-none"
                >
                  {queueBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon name={recommendation.icon} />
                  )}
                  Queue
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
