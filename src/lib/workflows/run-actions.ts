const LIVE_WORKFLOW_RUN_STATUSES = new Set(["QUEUED", "RUNNING"]);

export function workflowRunCanRerun(status?: string | null) {
  return !LIVE_WORKFLOW_RUN_STATUSES.has(String(status ?? "").toUpperCase());
}

export function workflowRunRerunBlockedMessage(status?: string | null) {
  return workflowRunCanRerun(status) ? null : "Wait for this workflow run to finish before rerunning it.";
}
