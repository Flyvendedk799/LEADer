import type { ExportRow } from "@/lib/types";
import { EXPORT_COLUMNS } from "./fields";

/** Markdown table — also serves as the base for the Notion-ready export. */
export function toMarkdown(rows: ExportRow[], title = "LEADer export"): string {
  const header = `| ${EXPORT_COLUMNS.join(" | ")} |`;
  const sep = `| ${EXPORT_COLUMNS.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (r) =>
        `| ${EXPORT_COLUMNS.map((c) => String(r[c] ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`,
    )
    .join("\n");
  return `# ${title}\n\n_${rows.length} opportunit${rows.length === 1 ? "y" : "ies"}_\n\n${header}\n${sep}\n${body}\n`;
}

/**
 * Notion-ready export. Notion imports Markdown tables cleanly; we additionally
 * emit a per-item section list which pastes well into Notion pages.
 */
export function toNotionMarkdown(rows: ExportRow[], title = "LEADer leads"): string {
  const table = toMarkdown(rows, title);
  const cards = rows
    .map((r) => {
      return [
        `## ${r.Title}`,
        `- **Source:** ${r.Source}`,
        `- **Budget:** ${r.Budget}`,
        `- **Deadline:** ${r.Deadline}`,
        `- **Status:** ${r.Status}`,
        `- **Match score:** ${r["Match score"]}`,
        r.URL ? `- **URL:** ${r.URL}` : "",
        r.Tags ? `- **Tags:** ${r.Tags}` : "",
        r["Next action"] ? `- **Next action:** ${r["Next action"]}` : "",
        r.Summary ? `\n${r.Summary}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
  return `${table}\n\n---\n\n${cards}\n`;
}
