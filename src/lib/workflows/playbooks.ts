import { dispatchForOwner, type DispatchResult } from "@/lib/alerts/dispatch";
import { runDueDiscovery, type RunResult } from "@/lib/ingestion";
import type { Workspace } from "@/lib/types";
import { summarizeSourceRuns, type SourceRunSummary } from "./summary";

export type WorkflowPlaybook = "daily-sweep";

export type DailySweepResult = {
  playbook: "daily-sweep";
  workspace: Workspace;
  ranAt: string;
  durationMs: number;
  sources: SourceRunSummary & { results: RunResult[] };
  reminders: DispatchResult;
  digest: DispatchResult;
  log: string[];
};

function workflowLogEntry(message: string) {
  return `${new Date().toISOString()} ${message}`;
}

export async function runDailySweep(ownerId: string, workspace: Workspace = "DK"): Promise<DailySweepResult> {
  const startedAt = Date.now();
  const log = [workflowLogEntry(`Started daily sweep for ${workspace}.`)];

  const sourceResults = await runDueDiscovery(ownerId);
  const sourceSummary = summarizeSourceRuns(sourceResults);
  log.push(
    workflowLogEntry(
      `Checked due sources: ${sourceSummary.ran} ran, ${sourceSummary.created} new, ${sourceSummary.updated} updated, ${sourceSummary.failed} failed.`,
    ),
  );

  const alerts = await dispatchForOwner(ownerId, { digest: true, workspace });
  log.push(
    workflowLogEntry(
      `Generated alerts: ${alerts.reminders.created} reminders and ${alerts.digest?.created ?? 0} digest.`,
    ),
  );

  const durationMs = Date.now() - startedAt;
  log.push(workflowLogEntry(`Finished daily sweep in ${Math.round(durationMs / 1000)}s.`));

  return {
    playbook: "daily-sweep",
    workspace,
    ranAt: new Date().toISOString(),
    durationMs,
    sources: { ...sourceSummary, results: sourceResults },
    reminders: alerts.reminders,
    digest: alerts.digest ?? { created: 0, emailed: 0, provider: "none" },
    log,
  };
}
