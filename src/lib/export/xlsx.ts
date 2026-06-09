import ExcelJS from "exceljs";
import type { ExportRow } from "@/lib/types";
import { EXPORT_COLUMNS } from "./fields";

/** Build an XLSX workbook buffer from export rows. */
export async function toXlsx(rows: ExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LEADer";
  const ws = wb.addWorksheet("Opportunities", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = EXPORT_COLUMNS.map((c) => ({
    header: c,
    key: c,
    width: c === "Summary" || c === "Notes" ? 50 : c === "Title" ? 36 : 18,
  }));

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  rows.forEach((r) => ws.addRow(r));
  ws.autoFilter = { from: "A1", to: { row: 1, column: EXPORT_COLUMNS.length } };

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
