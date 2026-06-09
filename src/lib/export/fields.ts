import type { ExportRow } from "@/lib/types";
import { formatBudget, formatDate, truncate } from "@/lib/utils";

// The export field contract (fixed column order across all formats).
export const EXPORT_COLUMNS: (keyof ExportRow)[] = [
  "Title",
  "Source",
  "URL",
  "Budget",
  "Deadline",
  "Status",
  "Match score",
  "Summary",
  "Notes",
  "Tags",
  "Next action",
];

/** Loose shape so this works with Prisma rows that include relations. */
export interface ExportableOpportunity {
  title: string;
  url?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  currency?: string | null;
  deadline?: Date | string | null;
  status: string;
  matchScore?: number | null;
  aiSummary?: string | null;
  nextAction?: string | null;
  source?: { name?: string | null } | null;
  notes?: { body: string }[];
  tags?: { tag: { name: string } }[];
}

export function toExportRow(o: ExportableOpportunity): ExportRow {
  return {
    Title: o.title,
    Source: o.source?.name ?? "—",
    URL: o.url ?? "",
    Budget: formatBudget(o.budgetMin, o.budgetMax, o.currency ?? "DKK"),
    Deadline: formatDate(o.deadline),
    Status: o.status,
    "Match score": o.matchScore != null ? String(o.matchScore) : "—",
    Summary: truncate(o.aiSummary, 500),
    Notes: (o.notes ?? []).map((n) => n.body).join(" | "),
    Tags: (o.tags ?? []).map((t) => t.tag.name).join(", "),
    "Next action": o.nextAction ?? "",
  };
}

export function toExportRows(items: ExportableOpportunity[]): ExportRow[] {
  return items.map(toExportRow);
}
