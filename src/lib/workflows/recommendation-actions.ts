type WorkflowRecommendationActionInput = {
  title: string;
  reason: string;
  playbook: string;
  workspace?: "DK" | "GLOBAL";
  options?: unknown;
};

export type WorkflowRecommendationBatchAction = "queue" | "save";

export function workflowRecommendationWorkspace(recommendation: WorkflowRecommendationActionInput) {
  return recommendation.workspace ?? "DK";
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
