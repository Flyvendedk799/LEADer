import type { ExportFormat } from "@/lib/types";
import { type ExportableOpportunity, toExportRows } from "./fields";
import { toCsv } from "./csv";
import { toXlsx } from "./xlsx";
import { toPdf } from "./pdf";
import { toMarkdown, toNotionMarkdown } from "./markdown";

export interface ExportResult {
  // Uint8Array (Buffer is a subclass) or string — both are valid Response BodyInit.
  body: Uint8Array | string;
  contentType: string;
  filename: string;
}

const EXT: Record<ExportFormat, { type: string; ext: string }> = {
  csv: { type: "text/csv; charset=utf-8", ext: "csv" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  pdf: { type: "application/pdf", ext: "pdf" },
  markdown: { type: "text/markdown; charset=utf-8", ext: "md" },
  notion: { type: "text/markdown; charset=utf-8", ext: "md" },
};

/** One entry point: opportunities → file in the requested format. */
export async function exportOpportunities(
  items: ExportableOpportunity[],
  format: ExportFormat,
  opts: { title?: string; filename?: string } = {},
): Promise<ExportResult> {
  const rows = toExportRows(items);
  const meta = EXT[format];
  const base = opts.filename || "leader-leads";
  const filename = `${base}.${meta.ext}`;

  let body: Buffer | string;
  switch (format) {
    case "csv":
      body = toCsv(rows);
      break;
    case "xlsx":
      body = await toXlsx(rows);
      break;
    case "pdf":
      body = await toPdf(rows, opts.title);
      break;
    case "markdown":
      body = toMarkdown(rows, opts.title);
      break;
    case "notion":
      body = toNotionMarkdown(rows, opts.title);
      break;
    default:
      body = toCsv(rows);
  }

  return { body, contentType: meta.type, filename };
}

export { toExportRows };
export type { ExportableOpportunity };
