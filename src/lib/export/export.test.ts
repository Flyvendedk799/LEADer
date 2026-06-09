import { describe, expect, it } from "vitest";
import { toExportRows } from "./fields";
import { toCsv } from "./csv";
import { toMarkdown, toNotionMarkdown } from "./markdown";

const sample = [
  {
    title: "AI MVP build",
    url: "https://x.dk/o/1",
    budgetMin: 50000,
    budgetMax: 80000,
    currency: "DKK",
    deadline: new Date("2026-09-01"),
    status: "NEW",
    matchScore: 82,
    aiSummary: "A funded MVP build.",
    nextAction: "Email the founder",
    source: { name: "EHSYS" },
    notes: [{ body: "Looks strong" }],
    tags: [{ tag: { name: "ai" } }, { tag: { name: "mvp" } }],
  },
];

describe("export", () => {
  it("maps opportunities to the fixed field contract", () => {
    const rows = toExportRows(sample);
    expect(rows[0].Title).toBe("AI MVP build");
    expect(rows[0]["Match score"]).toBe("82");
    expect(rows[0].Tags).toBe("ai, mvp");
  });

  it("produces CSV with a header and escaping", () => {
    const csv = toCsv(toExportRows(sample));
    expect(csv.split("\n")[0]).toContain("Title,Source,URL");
    expect(csv).toContain("AI MVP build");
  });

  it("produces markdown + notion variants", () => {
    const rows = toExportRows(sample);
    expect(toMarkdown(rows)).toContain("| Title |");
    expect(toNotionMarkdown(rows)).toContain("## AI MVP build");
  });
});
