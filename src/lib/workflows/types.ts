import { z } from "zod";

export const workflowRunInputSchema = z.object({
  playbook: z.enum(["daily-sweep", "pipeline-rescue", "candidate-harvest", "operating-day"]),
  workspace: z.enum(["DK", "GLOBAL"]).default("DK"),
});

export type WorkflowRunInput = z.infer<typeof workflowRunInputSchema>;
