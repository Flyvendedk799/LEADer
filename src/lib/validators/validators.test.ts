import { describe, expect, it } from "vitest";
import { parseFilters, opportunityCreateSchema, bulkOpportunitySchema, discoveryRunCreateSchema } from "./index";

describe("parseFilters", () => {
  it("drops invalid enum values from a crafted querystring", () => {
    const sp = new URLSearchParams(
      "status=NEW,BOGUS&applicationRoute=DIRECT,HACK&ingestMethod=AUTOMATED,XX&workspace=WAT",
    );
    const f = parseFilters(sp);
    expect(f.status).toEqual(["NEW"]);
    expect(f.applicationRoute).toEqual(["DIRECT"]);
    expect(f.ingestMethod).toEqual(["AUTOMATED"]);
    expect(f.workspace).toBeUndefined(); // invalid workspace ignored
  });

  it("parses numeric + boolean filters", () => {
    const f = parseFilters(new URLSearchParams("budgetMax=100000&scoreMin=60&activeOnly=true&hasBudget=false"));
    expect(f.budgetMax).toBe(100000);
    expect(f.scoreMin).toBe(60);
    expect(f.activeOnly).toBe(true);
    expect(f.hasBudget).toBe(false);
  });
});

describe("opportunityCreateSchema", () => {
  it("rejects budgetMin greater than budgetMax", () => {
    const r = opportunityCreateSchema.safeParse({ title: "Test lead", budgetMin: 90000, budgetMax: 10000 });
    expect(r.success).toBe(false);
  });
  it("accepts a sane budget range", () => {
    const r = opportunityCreateSchema.safeParse({ title: "Test lead", budgetMin: 10000, budgetMax: 90000 });
    expect(r.success).toBe(true);
  });
});

describe("bulkOpportunitySchema", () => {
  it("requires at least one id", () => {
    expect(bulkOpportunitySchema.safeParse({ ids: [], action: "delete" }).success).toBe(false);
  });
  it("requires status for setStatus", () => {
    expect(bulkOpportunitySchema.safeParse({ ids: ["a"], action: "setStatus" }).success).toBe(false);
    expect(
      bulkOpportunitySchema.safeParse({ ids: ["a"], action: "setStatus", status: "WON" }).success,
    ).toBe(true);
  });
  it("requires listId for addToList", () => {
    expect(bulkOpportunitySchema.safeParse({ ids: ["a"], action: "addToList" }).success).toBe(false);
    expect(
      bulkOpportunitySchema.safeParse({ ids: ["a"], action: "addToList", listId: "l1" }).success,
    ).toBe(true);
  });
  it("accepts a bare watchlist action", () => {
    expect(bulkOpportunitySchema.safeParse({ ids: ["a", "b"], action: "addToWatchlist" }).success).toBe(true);
  });
  it("rejects an unknown action", () => {
    expect(bulkOpportunitySchema.safeParse({ ids: ["a"], action: "nuke" }).success).toBe(false);
  });
});

describe("discoveryRunCreateSchema", () => {
  it("accepts AI-assisted freeform search controls", () => {
    const result = discoveryRunCreateSchema.safeParse({
      laneId: "lane_123",
      query: "Find boring B2B companies with spreadsheet-heavy reporting pain",
      freeformBrief: "Prioritize SMEs that need AI automation or internal tools.",
      useAiPlanner: true,
      searchMode: "wide",
      queryCount: 7,
      requiredTerms: ["reporting", "workflow"],
      excludedTerms: ["course", "job"],
      maxResults: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.useAiPlanner).toBe(true);
      expect(result.data.searchMode).toBe("wide");
      expect(result.data.requiredTerms).toEqual(["reporting", "workflow"]);
    }
  });
});
