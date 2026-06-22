import type { Prisma, WorkflowPreset } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { workflowRunInputSchema, workflowRunOptionsSchema, type WorkflowRunInput, type WorkflowRunOptions } from "./types";

const workflowPresetBaseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  playbook: z.enum(["daily-sweep", "pipeline-rescue", "candidate-harvest", "operating-day"]),
  workspace: z.enum(["DK", "GLOBAL"]).default("DK"),
  options: workflowRunOptionsSchema.default({}),
  pinned: z.boolean().optional().default(false),
});

export const workflowPresetFormSchema = workflowPresetBaseSchema.superRefine((preset, ctx) => {
  const parsed = workflowRunInputSchema.safeParse({
    playbook: preset.playbook,
    workspace: preset.workspace,
    options: preset.options,
  });
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    ctx.addIssue({
      ...issue,
      path: ["options", ...issue.path],
    });
  }
});

export const workflowPresetUpdateSchema = workflowPresetBaseSchema.partial().superRefine((preset, ctx) => {
  if (Object.keys(preset).length > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "No preset changes provided.",
  });
});

export type WorkflowPresetFormInput = z.infer<typeof workflowPresetFormSchema>;

type DefaultWorkflowPreset = WorkflowPresetFormInput & {
  description: string;
  pinned: boolean;
};

export const defaultWorkflowPresets: DefaultWorkflowPreset[] = [
  {
    name: "Operating day",
    description: "Sweep sources, harvest strong candidates, and rescue urgent pipeline work.",
    playbook: "operating-day",
    workspace: "DK",
    pinned: true,
    options: {
      operatingDay: {
        dailySweep: true,
        candidateHarvest: true,
        pipelineRescue: true,
      },
      dailySweep: {
        includeSources: true,
        includeAlerts: true,
      },
      candidateHarvest: {
        minScore: 70,
        limit: 6,
      },
      pipelineRescue: {
        staleDays: 14,
        deadlineDays: 7,
        limit: 12,
      },
    },
  },
  {
    name: "High-score harvest",
    description: "Convert only the strongest new candidates into active deal work.",
    playbook: "candidate-harvest",
    workspace: "DK",
    pinned: true,
    options: {
      candidateHarvest: {
        minScore: 82,
        limit: 5,
      },
    },
  },
  {
    name: "Pipeline rescue",
    description: "Create next actions for stale deals and near deadlines.",
    playbook: "pipeline-rescue",
    workspace: "DK",
    pinned: true,
    options: {
      pipelineRescue: {
        staleDays: 10,
        deadlineDays: 5,
        limit: 10,
      },
    },
  },
  {
    name: "Source sweep",
    description: "Run due public sources without sending alert digests.",
    playbook: "daily-sweep",
    workspace: "DK",
    pinned: false,
    options: {
      dailySweep: {
        includeSources: true,
        includeAlerts: false,
      },
    },
  },
];

export function presetToWorkflowInput(preset: Pick<WorkflowPreset, "playbook" | "workspace" | "options">): WorkflowRunInput {
  return workflowRunInputSchema.parse({
    playbook: preset.playbook,
    workspace: preset.workspace,
    options: preset.options ?? undefined,
  });
}

export function workflowPresetData(input: WorkflowPresetFormInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    playbook: input.playbook,
    workspace: input.workspace,
    options: JSON.parse(JSON.stringify(input.options ?? {})) as Prisma.InputJsonValue,
    pinned: input.pinned ?? false,
  };
}

export async function ensureDefaultWorkflowPresets(ownerId: string) {
  const existing = await db.workflowPreset.count({ where: { ownerId } });
  if (existing > 0) return;

  await db.workflowPreset.createMany({
    data: defaultWorkflowPresets.map((preset) => ({
      ownerId,
      ...workflowPresetData(preset),
    })),
    skipDuplicates: true,
  });
}

export function workflowPresetOptionSummary(options?: WorkflowRunOptions) {
  const parts: string[] = [];
  if (options?.operatingDay) {
    const phases = [
      options.operatingDay.dailySweep !== false ? "sweep" : null,
      options.operatingDay.candidateHarvest !== false ? "harvest" : null,
      options.operatingDay.pipelineRescue !== false ? "rescue" : null,
    ].filter(Boolean);
    if (phases.length) parts.push(phases.join(" + "));
  }
  if (options?.candidateHarvest?.minScore != null) parts.push(`score ${options.candidateHarvest.minScore}+`);
  if (options?.candidateHarvest?.limit != null) parts.push(`${options.candidateHarvest.limit} candidates`);
  if (options?.pipelineRescue?.staleDays != null) parts.push(`${options.pipelineRescue.staleDays}d stale`);
  if (options?.pipelineRescue?.deadlineDays != null) parts.push(`${options.pipelineRescue.deadlineDays}d deadlines`);
  if (options?.dailySweep?.includeSources === false) parts.push("sources off");
  if (options?.dailySweep?.includeAlerts === false) parts.push("alerts off");
  return parts.join(" · ");
}
