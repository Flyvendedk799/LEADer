import { describe, it, expect } from "vitest";
import { dealQuery, OPEN_STATUSES } from "./deal-query";
describe("deal queries", () => {
  it("rejects malformed pagination and status values without losing owner scope", () => {
    const query = dealQuery(
      "me",
      new URLSearchParams(
        "page=NaN&pageSize=Infinity&status=BAD&workspace=GLOBAL",
      ),
    );
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(25);
    expect(query.where).toEqual({
      ownerId: "me",
      workspace: "GLOBAL",
      status: { in: OPEN_STATUSES },
    });
  });
  it("allows completed deals to be found explicitly", () => {
    expect(
      dealQuery("me", new URLSearchParams("status=WON,LOST")).where.status,
    ).toEqual({ in: ["WON", "LOST"] });
    expect(
      dealQuery("me", new URLSearchParams("scope=all")).where.status,
    ).toBeUndefined();
  });
  it("combines missing next action with search instead of overwriting search", () => {
    const { where } = dealQuery(
      "me",
      new URLSearchParams("attention=no-action&q=website"),
    );
    expect(where.OR).toHaveLength(4);
    expect(where.AND).toBeDefined();
  });
  it("supports sort keys score, recent, deadline, value and defaults to score", () => {
    const defaultQuery = dealQuery("me", new URLSearchParams());
    expect(defaultQuery.orderBy).toEqual([
      { pursuitScore: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);

    const scoreQuery = dealQuery("me", new URLSearchParams("sort=score"));
    expect(scoreQuery.orderBy).toEqual([
      { pursuitScore: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);

    const recentQuery = dealQuery("me", new URLSearchParams("sort=recent"));
    expect(recentQuery.orderBy).toEqual([
      { updatedAt: "desc" },
      { id: "asc" },
    ]);

    const deadlineQuery = dealQuery("me", new URLSearchParams("sort=deadline"));
    expect(deadlineQuery.orderBy).toEqual([
      { deadline: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);

    const valueQuery = dealQuery("me", new URLSearchParams("sort=value"));
    expect(valueQuery.orderBy).toEqual([
      { valueMax: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);

    const fallbackQuery = dealQuery("me", new URLSearchParams("sort=unsupported_key"));
    expect(fallbackQuery.orderBy).toEqual([
      { pursuitScore: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);
  });
});
