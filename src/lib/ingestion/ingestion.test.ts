import { describe, expect, it } from "vitest";
import { assertAutomatable, isAutomatable } from "./compliance";
import { dedupeHash } from "./dedupe";
import { extractBudget, extractDeadline, detectApplicationRoute } from "./extract";

describe("compliance gate", () => {
  it("allows public source types", () => {
    expect(isAutomatable("RSS")).toBe(true);
    expect(isAutomatable("PUBLIC_WEB")).toBe(true);
  });

  it("blocks community/manual source types from automation", () => {
    expect(isAutomatable("FACEBOOK_MANUAL")).toBe(false);
    expect(isAutomatable("MANUAL")).toBe(false);
    expect(() => assertAutomatable("FACEBOOK_MANUAL")).toThrow();
  });
});

describe("dedupeHash", () => {
  it("is stable across tracking-param noise", () => {
    const a = dedupeHash({ title: "X", url: "https://a.dk/o/1?utm_source=fb" });
    const b = dedupeHash({ title: "X", url: "https://a.dk/o/1" });
    expect(a).toBe(b);
  });
  it("differs for different opportunities", () => {
    const a = dedupeHash({ title: "One", organization: "A" });
    const b = dedupeHash({ title: "Two", organization: "B" });
    expect(a).not.toBe(b);
  });
});

describe("heuristic extraction", () => {
  it("extracts a DKK budget", () => {
    expect(extractBudget("Budget op til kr. 80.000").max).toBe(80000);
    const range = extractBudget("50.000 - 100.000 kr");
    expect(range.min).toBe(50000);
    expect(range.max).toBe(100000);
  });
  it("extracts a deadline", () => {
    expect(extractDeadline("Ansøgningsfrist 2026-09-15")).toBeInstanceOf(Date);
    expect(extractDeadline("frist 15/03/2026")).toBeInstanceOf(Date);
  });
  it("rejects impossible dates instead of overflowing", () => {
    // 31 February must NOT silently roll into March.
    expect(extractDeadline("frist 31/02/2026")).toBeNull();
    expect(extractDeadline("ingen dato her")).toBeNull();
  });
  it("detects application route cues", () => {
    expect(detectApplicationRoute("Send din ansøgning her")).toBe("APPLICATION");
    expect(detectApplicationRoute("Kontakt os på mail@x.dk")).toBe("DIRECT");
  });
});
