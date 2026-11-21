import { describe, expect, it } from "vitest";
import { laneRotationPriorities } from "./lane-rotation";

describe("lane rotation", () => {
  it("serves never-run and least recently served lanes first, below manual runs", () => {
    const lanes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const last = new Map([
      ["a", new Date("2026-11-21T06:00:00Z")],
      ["b", new Date("2026-11-19T06:00:00Z")],
    ]);
    const priorities = laneRotationPriorities(lanes, last);
    expect(priorities.get("c")).toBe(-1); // never succeeded
    expect(priorities.get("b")).toBe(-2);
    expect(priorities.get("a")).toBe(-3);
    expect(Math.max(...priorities.values())).toBeLessThan(0);
  });
});
