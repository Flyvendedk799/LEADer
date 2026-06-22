import { z } from "zod";

export const workflowRunOptionsSchema = z.object({
  dailySweep: z.object({
    includeSources: z.boolean().optional(),
    includeAlerts: z.boolean().optional(),
  }).optional(),
  candidateHarvest: z.object({
    minScore: z.coerce.number().int().min(0).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  }).optional(),
  pipelineRescue: z.object({
    staleDays: z.coerce.number().int().min(1).max(90).optional(),
    deadlineDays: z.coerce.number().int().min(1).max(60).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }).optional(),
  operatingDay: z.object({
    dailySweep: z.boolean().optional(),
    candidateHarvest: z.boolean().optional(),
    pipelineRescue: z.boolean().optional(),
  }).optional(),
}).optional();

export const workflowRunInputSchema = z.object({
  playbook: z.enum(["daily-sweep", "pipeline-rescue", "candidate-harvest", "operating-day"]),
  workspace: z.enum(["DK", "GLOBAL"]).default("DK"),
  options: workflowRunOptionsSchema,
}).superRefine((input, ctx) => {
  if (input.playbook !== "operating-day") return;
  const phases = input.options?.operatingDay;
  if (!phases) return;
  const disabledAll =
    phases.dailySweep === false &&
    phases.candidateHarvest === false &&
    phases.pipelineRescue === false;
  if (disabledAll) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options", "operatingDay"],
      message: "Select at least one operating day phase.",
    });
  }
});

export type WorkflowRunInput = z.infer<typeof workflowRunInputSchema>;
export type WorkflowRunOptions = z.infer<typeof workflowRunOptionsSchema>;
