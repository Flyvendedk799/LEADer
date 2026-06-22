function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function workflowRunResultSummary(playbook: string, result: unknown) {
  const payload = objectValue(result);
  if (!payload) return null;

  const sources = objectValue(payload.sources);
  const digest = objectValue(payload.digest);
  const reminders = objectValue(payload.reminders);
  const staleDeals = objectValue(payload.staleDeals);
  const deadlines = objectValue(payload.deadlines);
  const candidates = objectValue(payload.candidates);
  const dailySweep = objectValue(payload.dailySweep);
  const candidateHarvest = objectValue(payload.candidateHarvest);
  const pipelineRescue = objectValue(payload.pipelineRescue);
  const operatingSources = objectValue(dailySweep?.sources);
  const operatingCandidates = objectValue(candidateHarvest?.candidates);
  const operatingStaleDeals = objectValue(pipelineRescue?.staleDeals);
  const operatingDeadlines = objectValue(pipelineRescue?.deadlines);
  const subject = typeof payload.subject === "string" ? payload.subject : "subject";

  if (playbook === "operating-day") {
    const rescueTasks =
      numberValue(operatingStaleDeals?.tasksCreated) + numberValue(operatingDeadlines?.tasksCreated);
    return `${numberValue(operatingSources?.created)} source leads - ${numberValue(operatingCandidates?.saved)} saved deals - ${rescueTasks} rescue tasks`;
  }

  if (playbook === "research-brief") {
    return `${numberValue(payload.createdTasks)} research tasks - ${numberValue(payload.skippedExistingTasks)} existing - ${subject}`;
  }

  if (playbook === "candidate-harvest") {
    return `${numberValue(candidates?.saved)} saved deals - ${numberValue(candidates?.alreadyInPipeline)} already in pipeline`;
  }

  if (playbook === "pipeline-rescue") {
    return `${numberValue(staleDeals?.tasksCreated)} stale tasks - ${numberValue(deadlines?.tasksCreated)} deadline tasks - ${numberValue(payload.nextActionsUpdated)} next actions`;
  }

  return `${numberValue(sources?.ran)} sources - ${numberValue(sources?.created)} new - ${numberValue(sources?.updated)} updated - ${numberValue(reminders?.created)} reminders - ${numberValue(digest?.created)} digest`;
}
