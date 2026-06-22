import type { RunResult } from "@/lib/ingestion";

export type SourceRunSummary = {
  ran: number;
  succeeded: number;
  failed: number;
  skipped: number;
  found: number;
  created: number;
  updated: number;
  errors: string[];
};

type SummarizableRun = Pick<RunResult, "status" | "found" | "created" | "updated" | "error">;

export function summarizeSourceRuns(results: SummarizableRun[]): SourceRunSummary {
  return results.reduce<SourceRunSummary>(
    (summary, result) => {
      summary.ran += 1;
      summary.found += result.found || 0;
      summary.created += result.created || 0;
      summary.updated += result.updated || 0;

      if (result.status === "SUCCESS") summary.succeeded += 1;
      if (result.status === "SKIPPED") summary.skipped += 1;
      if (result.status === "ERROR") {
        summary.failed += 1;
        if (result.error) summary.errors.push(result.error);
      }

      return summary;
    },
    {
      ran: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      found: 0,
      created: 0,
      updated: 0,
      errors: [],
    },
  );
}

export function sourceRunSummaryText(summary: SourceRunSummary) {
  if (summary.ran === 0) return "No due sources.";
  const failed = summary.failed ? `, ${summary.failed} failed` : "";
  const skipped = summary.skipped ? `, ${summary.skipped} skipped` : "";
  return `${summary.ran} ran, ${summary.created} new, ${summary.updated} updated${failed}${skipped}`;
}
