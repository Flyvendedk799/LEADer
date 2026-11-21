import { describe, expect, it } from "vitest";
import { citeCandidateFields } from "./field-evidence";
import { extractDeadline, extractBudget } from "@/lib/ingestion/extract";
import { extractJsonLd } from "@/lib/ingestion/parsers/structured";
import { load } from "cheerio";
import { qualifyCandidate } from "./qualification";
describe("traceable candidate facts", () => {
  it("extracts a sub-1000 hourly rate without inventing a project value", () => {
    expect(extractBudget("Freelance developer: 850 DKK pr. time")).toMatchObject({ max: 850, currency: "DKK" });
  });
  it("does not turn invented buyer or budget values into citations", () => {
    const fields = citeCandidateFields({ title: "Build a portal", organization: "Invented buyer", budgetMax: 100000, rawContent: "Build a portal. No budget announced.", provenance: { status: "read", retrievedAt: "2026-11-17T12:00:00Z" } });
    expect(fields.find(f => f.field === "Title")?.status).toBe("source");
    expect(fields.find(f => f.field === "Buyer")?.status).toBe("unverified");
    expect(fields.find(f => f.field === "Budget / rate")?.status).toBe("unverified");
    expect(fields.find(f => f.field === "Deadline")?.status).toBe("unknown");
  });
  it("retains original quotes and distinguishes a snippet from a read source", () => {
    const candidate = { title: "Portal implementation", rawContent: "Portal implementation. Budget 75.000 DKK. Tilbudsfrist: 20. december 2026", budgetMax: 75000, currency: "DKK", deadline: extractDeadline("20. december 2026"), url: "https://example.com/brief" };
    const fields = citeCandidateFields(candidate);
    expect(fields.find(f => f.field === "Budget / rate")).toMatchObject({ status: "snippet", url: candidate.url });
    expect(fields.find(f => f.field === "Deadline")?.quote).toContain("20. december 2026");
  });
  it("interprets Danish dates in Copenhagen, independent of server timezone", () => {
    expect(extractDeadline("8. december 2026 23:45")?.toISOString()).toBe("2026-12-08T22:45:00.000Z");
    expect(extractDeadline("8. juni 2026")?.toISOString()).toBe("2026-06-08T21:59:00.000Z");
    expect(extractDeadline("08/12/2026 25:75")).toBeNull();
    expect(extractDeadline("31/02/2026")).toBeNull();
  });
  it("preserves structured employment type so salaried roles can be excluded", () => {
    const parse = (employmentType: string) => extractJsonLd(load(`<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "React developer", description: "Develop our product", employmentType })}</script>`), "https://example.com/role")[0];
    expect(qualifyCandidate(parse("FULL_TIME")).kind).toBe("Employment");
    expect(qualifyCandidate(parse("CONTRACT")).engagement).toBe("Freelance contract");
  });
});
