import type { Prisma, WorkflowPreset } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { workflowRunInputSchema, workflowRunOptionsSchema, type WorkflowRunInput, type WorkflowRunOptions } from "./types";

const workflowPresetFieldsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  playbook: z.enum(["daily-sweep", "pipeline-rescue", "candidate-harvest", "operating-day"]),
  workspace: z.enum(["DK", "GLOBAL"]),
  options: workflowRunOptionsSchema,
  pinned: z.boolean(),
  scheduleEnabled: z.boolean(),
  scheduleIntervalHours: z.coerce.number().int().min(1).max(720),
  scheduleNextRunAt: z.coerce.date().optional().nullable(),
});

const workflowPresetBaseSchema = workflowPresetFieldsSchema.extend({
  workspace: workflowPresetFieldsSchema.shape.workspace.default("DK"),
  options: workflowRunOptionsSchema.default({}),
  pinned: workflowPresetFieldsSchema.shape.pinned.optional().default(false),
  scheduleEnabled: workflowPresetFieldsSchema.shape.scheduleEnabled.optional().default(false),
  scheduleIntervalHours: workflowPresetFieldsSchema.shape.scheduleIntervalHours.optional().default(24),
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

export const workflowPresetUpdateSchema = workflowPresetFieldsSchema.partial().superRefine((preset, ctx) => {
  if (Object.keys(preset).length > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "No preset changes provided.",
  });
});

export type WorkflowPresetFormInput = z.infer<typeof workflowPresetFormSchema>;
type WorkflowPresetScheduleFields = {
  scheduleEnabled?: boolean;
  scheduleIntervalHours?: number;
  scheduleNextRunAt?: Date | null;
};
type WorkflowPresetDataInput = Omit<
  WorkflowPresetFormInput,
  "scheduleEnabled" | "scheduleIntervalHours" | "scheduleNextRunAt"
> & WorkflowPresetScheduleFields;

type DefaultWorkflowPreset = WorkflowPresetDataInput & {
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

export function workflowPresetData(input: WorkflowPresetDataInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    playbook: input.playbook,
    workspace: input.workspace,
    options: JSON.parse(JSON.stringify(input.options ?? {})) as Prisma.InputJsonValue,
    pinned: input.pinned ?? false,
    scheduleEnabled: input.scheduleEnabled ?? false,
    scheduleIntervalHours: input.scheduleIntervalHours ?? 24,
    scheduleNextRunAt: input.scheduleEnabled ? input.scheduleNextRunAt ?? new Date() : input.scheduleNextRunAt ?? null,
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

export function nextWorkflowPresetRunAt(from: Date, intervalHours: number) {
  const hours = Number.isFinite(intervalHours) ? Math.max(1, Math.min(720, Math.round(intervalHours))) : 24;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function isWorkflowPresetDue(
  preset: Pick<WorkflowPreset, "scheduleEnabled" | "scheduleNextRunAt">,
  now = new Date(),
) {
  return preset.scheduleEnabled && (!preset.scheduleNextRunAt || preset.scheduleNextRunAt.getTime() <= now.getTime());
}

export function workflowPresetScheduleSummary(
  preset: Pick<WorkflowPreset, "scheduleEnabled" | "scheduleIntervalHours" | "scheduleNextRunAt">,
) {
  if (!preset.scheduleEnabled) return "Manual";
  const cadence = preset.scheduleIntervalHours === 24
    ? "Daily"
    : preset.scheduleIntervalHours % 24 === 0
      ? `Every ${preset.scheduleIntervalHours / 24}d`
      : `Every ${preset.scheduleIntervalHours}h`;
  return preset.scheduleNextRunAt ? `${cadence} · next ${preset.scheduleNextRunAt.toISOString()}` : `${cadence} · due now`;
}
