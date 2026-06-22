export type WorkflowQueueSnapshot = {
  activeRunId: string | null;
  queuedRunIds: string[];
};

export function workflowLogEntry(message: string, now = new Date()) {
  return `${now.toISOString()} ${message}`;
}

export function formatWorkflowElapsed(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function workflowQueueLogMessage(runId: string, queue: WorkflowQueueSnapshot) {
  if (queue.activeRunId === runId) {
    return "Background worker accepted playbook; it will keep running if this tab is closed.";
  }

  const queuedIndex = queue.queuedRunIds.indexOf(runId);
  if (queuedIndex >= 0) {
    return `Background worker queued playbook at position ${queuedIndex + 1}; it will run after active playbooks.`;
  }

  return "Background queue accepted playbook.";
}
