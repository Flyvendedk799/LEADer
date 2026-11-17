import { getDocumentProxy } from "unpdf";
export async function extractPdfText(bytes: Uint8Array) {
  if (bytes.byteLength > 2_000_000) throw new Error("PDF exceeds 2 MB reading limit");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    if (pdf.numPages > 40) throw new Error("PDF exceeds 40-page reading limit; review the original document");
    let text = "";
    for (let page = 1; page <= pdf.numPages && text.length < 20000; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      text += content.items.map(item => "str" in item ? item.str : "").join(" ") + "\n";
    }
    if (text.trim().length < 30) throw new Error("PDF has no readable text; manual review or OCR required");
    return text.slice(0, 20000);
  } finally { await pdf.destroy(); }
}
