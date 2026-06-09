import type { ExportRow } from "@/lib/types";
import { EXPORT_COLUMNS } from "./fields";

function escape(value: string): string {
  const v = value ?? "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(rows: ExportRow[]): string {
  const header = EXPORT_COLUMNS.join(",");
  const body = rows
    .map((r) => EXPORT_COLUMNS.map((c) => escape(String(r[c] ?? ""))).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}
