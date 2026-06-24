import { describe, expect, it } from "vitest";

import { HISTORY_MAX_LIMIT, nextHistoryLimit } from "./history-window";

describe("history window expansion", () => {
  it("pages normally when history is browsed without a search", () => {
    expect(nextHistoryLimit(20, false)).toBe(40);
    expect(nextHistoryLimit(90, false)).toBe(HISTORY_MAX_LIMIT);
  });

  it("jumps to the cap when searching old history", () => {
    expect(nextHistoryLimit(20, true)).toBe(HISTORY_MAX_LIMIT);
    expect(nextHistoryLimit(60, true)).toBe(HISTORY_MAX_LIMIT);
  });

  it("handles invalid current limits conservatively", () => {
    expect(nextHistoryLimit(Number.NaN, false)).toBe(40);
    expect(nextHistoryLimit(Number.NaN, true)).toBe(HISTORY_MAX_LIMIT);
  });
});
