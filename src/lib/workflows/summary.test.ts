import { describe, expect, it } from "vitest";

import { summarizeSourceRuns } from "./summary";

describe("summarizeSourceRuns", () => {
  it("summarizes successful, failed, and skipped source runs", () => {
    expect(
      summarizeSourceRuns([
        { status: "SUCCESS", found: 3, created: 2, updated: 1 },
        { status: "ERROR", found: 1, created: 0, updated: 0, error: "timeout" },
        { status: "SKIPPED", found: 0, created: 0, updated: 0 },
      ]),
    ).toEqual({
      ran: 3,
      succeeded: 1,
      failed: 1,
      skipped: 1,
      found: 4,
      created: 2,
      updated: 1,
      errors: ["timeout"],
    });
  });

  it("returns empty totals when no sources are due", () => {
    expect(summarizeSourceRuns([])).toEqual({
      ran: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      found: 0,
      created: 0,
      updated: 0,
      errors: [],
    });
  });
});
