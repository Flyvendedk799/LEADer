/** RFC4180-style CSV parsing: quoted commas, doubled quotes and multiline cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); if (row.some(c => c.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
    if (rows.length > 200) throw new Error("Import at most 200 rows at once");
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  row.push(cell); if (row.some(c => c.trim())) rows.push(row);
  return rows;
}
