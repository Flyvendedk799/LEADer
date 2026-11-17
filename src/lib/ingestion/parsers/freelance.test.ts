import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { getParser } from ".";
describe("captured public freelance listings", () => {
  it("reads DBA listings without confusing start dates with deadlines or brokers with buyers", () => {
    const html = readFileSync(new URL("./fixtures/dba-2026-11-17.html", import.meta.url), "utf8");
    const rows = getParser("dba-assignments")!(load(html), "https://dba-consult.dk/jobs/");
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.some(r => r.title.includes("Kubernetes"))).toBe(true);
    expect(rows.every(r => !r.deadline && !r.organization && r.url?.includes("/job/"))).toBe(true);
  });
  it("excludes closed Need Consult assignments and preserves their original URLs", () => {
    const html = readFileSync(new URL("./fixtures/need-2026-11-17.html", import.meta.url), "utf8");
    const rows = getParser("need-assignments")!(load(html), "https://needconsult.dk/it-freelance-opgaver/");
    expect(rows).toHaveLength(5);
    expect(rows.some(r => r.title === "Salesforce Sales Cloud TA")).toBe(false);
    expect(rows.every(r => r.url?.startsWith("https://needconsult.dk/it-freelance-opgaver/") && !r.deadline)).toBe(true);
  });
  it("reports markup drift instead of silently reporting a successful empty feed", () => {
    for (const key of ["dba-assignments", "need-assignments"]) expect(() => getParser(key)!(load("<main>Unexpected layout</main>"), "https://example.com")).toThrow("markup changed");
  });
});
