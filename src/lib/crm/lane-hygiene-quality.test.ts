import { describe, expect, it } from "vitest";
import { deadlinePassed, duplicateKeeperOrder } from "./lane-hygiene";

describe("candidate quality hygiene", () => {
  const now = new Date("2026-11-21T12:00:00Z").getTime();

  it("treats a deadline as passed only after a day of slack", () => {
    expect(deadlinePassed("2026-11-19T23:00:00Z", now)).toBe(true);
    expect(deadlinePassed("2026-11-20T23:00:00Z", now)).toBe(false);
    expect(deadlinePassed(null, now)).toBe(false);
  });

  it("keeps the best-scoring duplicate, then the tenders lane, then the newest", () => {
    const rows = [
      { id: "funded-low", pursuitScore: 60, lane: { slug: "funded-work" }, createdAt: new Date(1) },
      { id: "funded-old", pursuitScore: 90, lane: { slug: "funded-work" }, createdAt: new Date(2) },
      { id: "funded-new", pursuitScore: 90, lane: { slug: "funded-work" }, createdAt: new Date(3) },
      { id: "tender-high", pursuitScore: 90, lane: { slug: "tenders-procurement" }, createdAt: new Date(1) },
    ];
    expect([...rows].sort(duplicateKeeperOrder).map((r) => r.id)).toEqual(["tender-high", "funded-new", "funded-old", "funded-low"]);
  });
});
