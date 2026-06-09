import { describe, expect, it } from "vitest";
import { parseFilters, opportunityCreateSchema } from "./index";

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
