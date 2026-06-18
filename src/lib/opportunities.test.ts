import { describe, expect, it } from "vitest";
import { buildWhere, buildOrderBy } from "./opportunities";
import type { OpportunityFilter } from "./types";

const OWNER = "owner_1";

describe("buildWhere", () => {
  it("always scopes to the owner", () => {
    expect(buildWhere(OWNER, {}).ownerId).toBe(OWNER);
  });

  it("activeOnly filters by deadline (not the stale isActive flag)", () => {
    const w = buildWhere(OWNER, { activeOnly: true });
    // Should NOT pin isActive; should add a deadline OR clause to AND.
    expect(w.isActive).toBeUndefined();
    const and = (w.AND as object[]) ?? [];
    const hasDeadlineOr = and.some(
      (c) => Array.isArray((c as { OR?: unknown[] }).OR),
    );
    expect(hasDeadlineOr).toBe(true);
  });

  it("hasBudget=true matches either budget field present", () => {
    const w = buildWhere(OWNER, { hasBudget: true });
    const and = (w.AND as { OR?: unknown[] }[]) ?? [];
    expect(and.some((c) => Array.isArray(c.OR))).toBe(true);
  });

  it("hasBudget=false matches only fully missing budgets", () => {
    const w = buildWhere(OWNER, { hasBudget: false });
    const and = (w.AND as Record<string, unknown>[]) ?? [];
    expect(and.some((c) => c.budgetMin === null && c.budgetMax === null)).toBe(true);
  });

  it("budget range uses overlap semantics", () => {
    const w = buildWhere(OWNER, { budgetMin: 40000, budgetMax: 90000 });
    const and = JSON.stringify(w.AND);
    expect(and).toContain("budgetMax");
    expect(and).toContain("budgetMin");
  });

  it("keyword search builds an OR across text fields", () => {
    const w = buildWhere(OWNER, { q: "mvp" });
    const and = (w.AND as { OR?: unknown[] }[]) ?? [];
    expect(and.some((c) => Array.isArray(c.OR))).toBe(true);
  });

  it("status filter becomes an `in` clause", () => {
    const w = buildWhere(OWNER, { status: ["NEW", "WON"] } as OpportunityFilter);
    expect((w.status as { in: string[] }).in).toEqual(["NEW", "WON"]);
  });
});

describe("buildOrderBy", () => {
  it("defaults to score desc", () => {
    expect(buildOrderBy({})).toEqual({ matchScore: "desc" });
  });
  it("honours deadline asc", () => {
    expect(buildOrderBy({ sort: "deadline", order: "asc" })).toEqual({ deadline: "asc" });
  });
  it("sorts by title", () => {
    expect(buildOrderBy({ sort: "title", order: "asc" })).toEqual({ title: "asc" });
  });
  it("sorts by budget desc", () => {
    expect(buildOrderBy({ sort: "budget", order: "desc" })).toEqual({ budgetMax: "desc" });
  });
});
