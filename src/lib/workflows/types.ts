import { z } from "zod";

export const workflowRunInputSchema = z.object({
  playbook: z.enum(["daily-sweep", "pipeline-rescue"]),
  workspace: z.enum(["DK", "GLOBAL"]).default("DK"),
});

export type WorkflowRunInput = z.infer<typeof workflowRunInputSchema>;
