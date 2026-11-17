import { describe, expect, it } from "vitest";
import { qualifyCandidate } from "./qualification";
import { parseCsv } from "./tabular-import";
import { discoveryCandidateDedupeKey } from "@/lib/crm/candidate-dedupe";
import { companyProfile, companyProfileSchema } from "@/lib/company-profile";
import { usagePeriods } from "@/lib/jobs/usage";
import { scoreOpportunity } from "@/lib/scoring";

describe("bureau acquisition", () => {
  it.each([
    ["Seeking software development agency for our new portal", "Advertised work"],
    ["Freelance developer contract role, full-time for six months", "Advertised work"],
    ["Fastansættelse: softwareudvikler til vores team", "Employment"],
    ["Unpaid technical cofounder, equity only", "Unpaid"],
    ["Our company raised funding for product expansion", "Prospecting signal"],
    ["Guide to applying for digitalisation grants", "Prospecting signal"],
    ["Indsend tilbud: udvikling af intern software", "Advertised work"],
    ["Agency seeking subcontractor for client delivery", "Advertised work"],
  ])("distinguishes evidence in %s", (title, kind) => {
    expect(qualifyCandidate({ title }).kind).toBe(kind);
  });
  it("keeps hourly rates distinct from project values", () => {
    expect(qualifyCandidate({ title: "Freelance developer 850 DKK pr. time" }).valueBasis).toBe("Hourly rate");
  });
  it("labels missing evidence instead of inventing it", () => {
    expect(qualifyCandidate({ title: "Company expands" }).missing).toContain("Budget or rate");
  });
  it("preserves quoted commas, escaped quotes and multiline CSV descriptions", () => {
    expect(parseCsv('title,description\r\n"Portal, phase 2","Line 1\nA ""quoted"" brief"')).toEqual([["title", "description"], ["Portal, phase 2", 'Line 1\nA "quoted" brief']]);
    expect(() => parseCsv('title\n"unfinished')).toThrow("unclosed");
  });
  it("deduplicates tracking URLs without flattening different source records", () => {
    const key = (url: string) => discoveryCandidateDedupeKey({ slug: "client-projects" }, { url });
    expect(key("https://example.com/Project?id=2&utm_source=email")).toBe(key("https://example.com/Project?id=2"));
    expect(key("https://example.com/Project?id=2")).not.toBe(key("https://example.com/project?id=3"));
  });
  it("does not collapse unrelated no-URL imports with the same row number", () => {
    const key = (title: string) => discoveryCandidateDedupeKey({ slug: "community-manual" }, { id: "pasted-0", title });
    expect(key("Build a customer portal")).not.toBe(key("Integrate the accounting system"));
  });
  it("requires explicit provider allowances and rejects invalid values", () => {
    expect(companyProfile({}).dailySearchQueries).toBe(0);
    expect(companyProfileSchema.safeParse({ dailyAiCalls: -1 }).success).toBe(false);
    expect(usagePeriods(new Date("2026-12-01T01:00:00Z")).month.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("does not penalize large projects when the budget ceiling is disabled", () => {
    const total = (budgetMax: number) => scoreOpportunity({ title: "Software project", budgetMax }, { budgetMaxDkk: 0 }).components.find(c => c.criterion === "budgetFit");
    expect(total(50000)).toEqual(total(500000));
  });
});
