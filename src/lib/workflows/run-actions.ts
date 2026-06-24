import { workflowRunInputSchema, type WorkflowRunInput } from "./types";

const LIVE_WORKFLOW_RUN_STATUSES = new Set(["QUEUED", "RUNNING"]);

export function workflowRunCanRerun(status?: string | null) {
  return !LIVE_WORKFLOW_RUN_STATUSES.has(String(status ?? "").toUpperCase());
}

export function workflowRunRerunBlockedMessage(status?: string | null) {
  return workflowRunCanRerun(status) ? null : "Wait for this workflow run to finish before rerunning it.";
}

type ActiveWorkflowRunLike = {
  playbook?: string | null;
  workspace?: string | null;
  input?: unknown;
};

function sortedJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) out[key] = normalizeJson(item);
  }
  return out;
}

function normalizedDailySweepOptions(input: WorkflowRunInput) {
  return {
    includeSources: input.options?.dailySweep?.includeSources !== false,
    includeAlerts: input.options?.dailySweep?.includeAlerts !== false,
  };
}

function normalizedCandidateHarvestOptions(input: WorkflowRunInput) {
  return {
    minScore: input.options?.candidateHarvest?.minScore ?? 70,
    limit: input.options?.candidateHarvest?.limit ?? 5,
  };
}

function normalizedPipelineRescueOptions(input: WorkflowRunInput) {
  return {
    staleDays: input.options?.pipelineRescue?.staleDays ?? 14,
    deadlineDays: input.options?.pipelineRescue?.deadlineDays ?? 7,
    limit: input.options?.pipelineRescue?.limit ?? 12,
  };
}

function workflowRunDedupeFingerprint(input: WorkflowRunInput) {
  if (input.playbook === "daily-sweep") {
    return {
      playbook: input.playbook,
      workspace: input.workspace,
      dailySweep: normalizedDailySweepOptions(input),
    };
  }

  if (input.playbook === "candidate-harvest") {
    return {
      playbook: input.playbook,
      workspace: input.workspace,
      candidateHarvest: normalizedCandidateHarvestOptions(input),
    };
  }

  if (input.playbook === "pipeline-rescue") {
    return {
      playbook: input.playbook,
      workspace: input.workspace,
      pipelineRescue: normalizedPipelineRescueOptions(input),
    };
  }

  if (input.playbook === "operating-day") {
    const phases = {
      dailySweep: input.options?.operatingDay?.dailySweep !== false,
      candidateHarvest: input.options?.operatingDay?.candidateHarvest !== false,
      pipelineRescue: input.options?.operatingDay?.pipelineRescue !== false,
    };
    return {
      playbook: input.playbook,
      workspace: input.workspace,
      operatingDay: phases,
      dailySweep: phases.dailySweep ? normalizedDailySweepOptions(input) : undefined,
      candidateHarvest: phases.candidateHarvest ? normalizedCandidateHarvestOptions(input) : undefined,
      pipelineRescue: phases.pipelineRescue ? normalizedPipelineRescueOptions(input) : undefined,
    };
  }

  return {
    playbook: input.playbook,
    workspace: input.workspace,
    researchBrief: input.options?.researchBrief,
  };
}

function parseRunInput(run: ActiveWorkflowRunLike) {
  const parsed = workflowRunInputSchema.safeParse(run.input ?? {
    playbook: run.playbook,
    workspace: run.workspace,
  });
  if (parsed.success) return parsed.data;

  const fallback = workflowRunInputSchema.safeParse({
    playbook: run.playbook,
    workspace: run.workspace,
  });
  return fallback.success ? fallback.data : null;
}

export function workflowRunInputMatchesActiveRun(input: WorkflowRunInput, run: ActiveWorkflowRunLike) {
  const parsedRunInput = parseRunInput(run);
  if (!parsedRunInput) return false;
  if (input.playbook !== parsedRunInput.playbook || input.workspace !== parsedRunInput.workspace) return false;
  return sortedJson(workflowRunDedupeFingerprint(input)) === sortedJson(workflowRunDedupeFingerprint(parsedRunInput));
}
