type WorkflowRecommendationActionInput = {
  title: string;
  reason: string;
  playbook: string;
  workspace?: "DK" | "GLOBAL";
  options?: unknown;
};

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
