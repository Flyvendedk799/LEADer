import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "./pdf";
describe("public document extraction", () => {
  it("extracts actual document text and rejects image-only documents", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText("Supplier brief: build an application portal. Deadline 20 December 2026.", { font, size: 12, x: 20, y: 200 });
    expect(await extractPdfText(await pdf.save())).toContain("Supplier brief");
    const blank = await PDFDocument.create(); blank.addPage();
    await expect(extractPdfText(await blank.save())).rejects.toThrow("no readable text");
  });
  it("enforces byte limits before opening the document", async () => {
    await expect(extractPdfText(new Uint8Array(2_000_001))).rejects.toThrow("2 MB");
  });
});
