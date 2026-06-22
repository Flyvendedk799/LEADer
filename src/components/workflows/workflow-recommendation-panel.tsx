"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Database, Loader2, Sparkles, Target, TimerReset } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type WorkflowPlaybook = "daily-sweep" | "pipeline-rescue" | "candidate-harvest" | "operating-day";

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

export function WorkflowRecommendationPanel({
  recommendations,
}: {
  recommendations: WorkflowRecommendationItem[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function queueRecommendation(recommendation: WorkflowRecommendationItem) {
    setBusyId(recommendation.id);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbook: recommendation.playbook,
          workspace: "DK",
          options: recommendation.options,
        }),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) {
        throw new Error(String(data?.error || "Could not queue workflow"));
      }
      toast.success(`${recommendation.title} queued`, "It will keep running in the background.");
      router.refresh();
    } catch (err) {
      toast.error("Could not queue workflow", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  if (recommendations.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No urgent workflow moves right now.</p>;
  }

  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {recommendations.map((recommendation) => {
        const busy = busyId === recommendation.id;
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
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={() => queueRecommendation(recommendation)}
              className="w-full md:w-auto"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon name={recommendation.icon} />}
              Queue
            </Button>
          </div>
        );
      })}
    </div>
  );
}
