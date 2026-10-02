import { describe, expect, it } from "vitest";

import { nineAmCopenhagen } from "./dates";

describe("nineAmCopenhagen", () => {
  it("returns 09:00 Copenhagen summer time (UTC+2)", () => {
    expect(nineAmCopenhagen(new Date("2026-06-22T10:00:00.000Z")).toISOString()).toBe("2026-06-22T07:00:00.000Z");
  });

  it("returns 09:00 Copenhagen winter time (UTC+1)", () => {
    expect(nineAmCopenhagen(new Date("2026-01-15T10:00:00.000Z")).toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("shifts by whole Copenhagen calendar days", () => {
    expect(nineAmCopenhagen(new Date("2026-06-22T10:00:00.000Z"), 1).toISOString()).toBe("2026-06-23T07:00:00.000Z");
    expect(nineAmCopenhagen(new Date("2026-06-22T10:00:00.000Z"), -1).toISOString()).toBe("2026-06-21T07:00:00.000Z");
  });

  it("uses the Copenhagen calendar day, not the UTC day, near midnight", () => {
    // 23:30 UTC on 22 June is already 01:30 on 23 June in Copenhagen.
    expect(nineAmCopenhagen(new Date("2026-06-22T23:30:00.000Z")).toISOString()).toBe("2026-06-23T07:00:00.000Z");
  });

  it("stays correct across the DST changeover", () => {
    // Clocks go forward on 29 March 2026: 28 March is UTC+1, 30 March is UTC+2.
    expect(nineAmCopenhagen(new Date("2026-03-28T12:00:00.000Z"), 2).toISOString()).toBe("2026-03-30T07:00:00.000Z");
    expect(nineAmCopenhagen(new Date("2026-03-28T12:00:00.000Z")).toISOString()).toBe("2026-03-28T08:00:00.000Z");
  });

  it("handles month overflow", () => {
    expect(nineAmCopenhagen(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2026-02-01T08:00:00.000Z");
  });
});
