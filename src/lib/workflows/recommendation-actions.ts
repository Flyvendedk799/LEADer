export type WorkflowRecommendationActionInput = {
  title: string;
  reason: string;
  playbook: string;
  workspace?: "DK" | "GLOBAL";
  options?: unknown;
};

type WorkflowRecommendationActiveRun = {
  playbook: string;
  workspace?: string | null;
  status?: string | null;
  finishedAt?: Date | string | null;
  input?: unknown;
};

export type WorkflowRecommendationBatchAction = "queue" | "save";

const ACTIVE_RUN_STATUSES = new Set(["QUEUED", "RUNNING"]);
const OPERATING_DAY_PHASES: Record<string, "dailySweep" | "candidateHarvest" | "pipelineRescue"> = {
  "daily-sweep": "dailySweep",
  "candidate-harvest": "candidateHarvest",
  "pipeline-rescue": "pipelineRescue",
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function optionsFrom(value: unknown) {
  const payload = objectValue(value);
  return objectValue(payload?.options);
}

function operatingDayIncludesPlaybook(options: unknown, playbook: string) {
  if (playbook === "operating-day") return true;
  const phase = OPERATING_DAY_PHASES[playbook];
  if (!phase) return false;
  const operatingDay = objectValue(optionsFrom(options)?.operatingDay ?? objectValue(options)?.operatingDay);
  return operatingDay?.[phase] !== false;
}

function recommendationIncludesPlaybook(recommendation: WorkflowRecommendationActionInput, playbook: string) {
  if (recommendation.playbook === playbook) return true;
  return recommendation.playbook === "operating-day" && operatingDayIncludesPlaybook(recommendation.options, playbook);
}

function activeRunIncludesPlaybook(run: WorkflowRecommendationActiveRun, playbook: string) {
  if (run.playbook === playbook) return true;
  return run.playbook === "operating-day" && operatingDayIncludesPlaybook(run.input, playbook);
}

export function workflowRecommendationWorkspace(recommendation: WorkflowRecommendationActionInput) {
  return recommendation.workspace ?? "DK";
}

export function workflowRecommendationBlockedByActiveRun(
  recommendation: WorkflowRecommendationActionInput,
  run: WorkflowRecommendationActiveRun,
) {
  if (!ACTIVE_RUN_STATUSES.has(String(run.status ?? "")) || run.finishedAt) return false;
  const workspace = workflowRecommendationWorkspace(recommendation);
  if ((run.workspace ?? "DK") !== workspace) return false;

  if (activeRunIncludesPlaybook(run, recommendation.playbook)) return true;

  if (recommendation.playbook === "operating-day") {
    return recommendationIncludesPlaybook(recommendation, run.playbook);
  }

  return false;
}

export function filterWorkflowRecommendations<T extends WorkflowRecommendationActionInput>(
  recommendations: T[],
  activeRuns: WorkflowRecommendationActiveRun[],
) {
  return recommendations.filter(
    (recommendation) =>
      !activeRuns.some((run) => workflowRecommendationBlockedByActiveRun(recommendation, run)),
  );
}

export function workflowRecommendationRunPayload(recommendation: WorkflowRecommendationActionInput) {
  return {
    playbook: recommendation.playbook,
    workspace: workflowRecommendationWorkspace(recommendation),
    options: recommendation.options,
  };
}

export function workflowRecommendationPresetPayload(recommendation: WorkflowRecommendationActionInput) {
  return {
    name: `${recommendation.title} mode`,
    description: recommendation.reason,
    playbook: recommendation.playbook,
    workspace: workflowRecommendationWorkspace(recommendation),
    pinned: false,
    scheduleEnabled: false,
    scheduleIntervalHours: 24,
    scheduleNextRunAt: null,
    options: recommendation.options ?? {},
  };
}

function recommendedMoveCount(count: number) {
  return `${count} recommended ${count === 1 ? "move" : "moves"}`;
}

export function workflowRecommendationBatchToast(
  action: WorkflowRecommendationBatchAction,
  succeeded: number,
  failed: number,
) {
  const verb = action === "queue" ? "queued" : "saved";

  if (succeeded > 0 && failed > 0) {
    return {
      title: "Some recommendations failed",
      description: `${recommendedMoveCount(succeeded)} ${verb} - ${failed} failed`,
    };
  }

  if (succeeded > 0) {
    return {
      title: `Recommendations ${verb}`,
      description:
        action === "queue"
          ? `${recommendedMoveCount(succeeded)} queued for background runs`
          : `${recommendedMoveCount(succeeded)} saved as ${succeeded === 1 ? "a preset" : "presets"}`,
    };
  }

  return {
    title: action === "queue" ? "No recommendations queued" : "No recommendations saved",
    description: failed > 0 ? `${failed} failed` : "No recommendations available",
  };
}
