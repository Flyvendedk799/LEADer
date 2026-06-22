import { db } from "@/lib/db";
import { isSourceDue } from "@/lib/ingestion";
import type { WorkflowRunInput, WorkflowRunOptions } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const OPEN_DEAL_STATUSES = ["DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const;
const AUTOMATABLE_SOURCE_TYPES = new Set(["RSS", "NEWSLETTER", "PUBLIC_WEB", "PROCUREMENT", "ACCELERATOR", "API"]);

type DailySweepOptions = NonNullable<WorkflowRunOptions>["dailySweep"];
type CandidateHarvestOptions = NonNullable<WorkflowRunOptions>["candidateHarvest"];
type PipelineRescueOptions = NonNullable<WorkflowRunOptions>["pipelineRescue"];

export type WorkflowRunPreview = {
  playbook: WorkflowRunInput["playbook"];
  workspace: WorkflowRunInput["workspace"];
  phases: {
    dailySweep: boolean;
    candidateHarvest: boolean;
    pipelineRescue: boolean;
  };
  dailySweep: {
    includeSources: boolean;
    includeAlerts: boolean;
    dueSources: number;
  };
  candidateHarvest: {
    minScore: number;
    limit: number;
    matchingCandidates: number;
    willReview: number;
  };
  pipelineRescue: {
    staleDays: number;
    deadlineDays: number;
    limit: number;
    staleDeals: number;
    deadlineDeals: number;
    willReview: number;
  };
};

function dailySweepOptions(options?: DailySweepOptions) {
  return {
    includeSources: options?.includeSources !== false,
    includeAlerts: options?.includeAlerts !== false,
  };
}

function candidateHarvestOptions(options?: CandidateHarvestOptions) {
  return {
    minScore: options?.minScore ?? 70,
    limit: options?.limit ?? 5,
  };
}

function pipelineRescueOptions(options?: PipelineRescueOptions) {
  return {
    staleDays: options?.staleDays ?? 14,
    deadlineDays: options?.deadlineDays ?? 7,
    limit: options?.limit ?? 12,
  };
}

function phases(input: WorkflowRunInput) {
  if (input.playbook === "operating-day") {
    return {
      dailySweep: input.options?.operatingDay?.dailySweep !== false,
      candidateHarvest: input.options?.operatingDay?.candidateHarvest !== false,
      pipelineRescue: input.options?.operatingDay?.pipelineRescue !== false,
    };
  }

  return {
    dailySweep: input.playbook === "daily-sweep",
    candidateHarvest: input.playbook === "candidate-harvest",
    pipelineRescue: input.playbook === "pipeline-rescue",
  };
}

export async function previewWorkflowRun(
  ownerId: string,
  input: WorkflowRunInput,
  now = new Date(),
): Promise<WorkflowRunPreview> {
  const activePhases = phases(input);
  const sweepOptions = dailySweepOptions(input.options?.dailySweep);
  const harvestOptions = candidateHarvestOptions(input.options?.candidateHarvest);
  const rescueOptions = pipelineRescueOptions(input.options?.pipelineRescue);

  const staleCutoff = new Date(now.getTime() - rescueOptions.staleDays * DAY);
  const deadlineHorizon = new Date(now.getTime() + rescueOptions.deadlineDays * DAY);

  const [sources, matchingCandidates, staleDeals, deadlineDeals] = await Promise.all([
    activePhases.dailySweep && sweepOptions.includeSources
      ? db.source.findMany({
          where: { ownerId, enabled: true },
          select: { id: true, type: true, frequency: true, lastCheckedAt: true },
        })
      : [],
    activePhases.candidateHarvest
      ? db.discoveryCandidate.count({
          where: {
            ownerId,
            workspace: input.workspace,
            status: "NEW",
            pursuitScore: { gte: harvestOptions.minScore },
          },
        })
      : 0,
    activePhases.pipelineRescue
      ? db.deal.count({
          where: {
            ownerId,
            workspace: input.workspace,
            status: { in: [...OPEN_DEAL_STATUSES] },
            updatedAt: { lt: staleCutoff },
          },
        })
      : 0,
    activePhases.pipelineRescue
      ? db.deal.count({
          where: {
            ownerId,
            workspace: input.workspace,
            status: { in: [...OPEN_DEAL_STATUSES] },
            deadline: { gte: now, lte: deadlineHorizon },
          },
        })
      : 0,
  ]);

  const dueSources = sources.filter(
    (source) => AUTOMATABLE_SOURCE_TYPES.has(source.type) && isSourceDue(source, now),
  ).length;
  const pipelineWillReview = Math.min(staleDeals, rescueOptions.limit) + Math.min(deadlineDeals, rescueOptions.limit);

  return {
    playbook: input.playbook,
    workspace: input.workspace,
    phases: activePhases,
    dailySweep: {
      ...sweepOptions,
      dueSources,
    },
    candidateHarvest: {
      ...harvestOptions,
      matchingCandidates,
      willReview: Math.min(matchingCandidates, harvestOptions.limit),
    },
    pipelineRescue: {
      ...rescueOptions,
      staleDeals,
      deadlineDeals,
      willReview: pipelineWillReview,
    },
  };
}
