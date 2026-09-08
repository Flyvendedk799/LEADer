import { describe, expect, it, vi } from "vitest";

// The module imports the Prisma client at load time; these tests only exercise
// the pure row → training-sample conversion, so a bare stub is enough.
vi.mock("@/lib/db", () => ({ db: {} }));

import { recoverRawSignals, toOutcomeSample } from "./outcomes";
import { OUTCOME_LABELS } from "./calibration";
import type { OpportunityStatus } from "@/lib/types";

/** Minimal Prisma-shaped row. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "opp-1",
    status: "WON",
    title: "AI automation MVP for a Danish SME",
    description: "Build a prototype platform.",
    rawContent: null,
    budgetMin: null,
    budgetMax: 90000,
    deadline: null,
    organization: "Erhvervshus Midtjylland",
    category: "voucher",
    applicationRoute: "DIRECT",
    workspace: "DK",
    contacts: [],
    source: { name: "EHSYS" },
    scoreBreakdown: null,
    updatedAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  } as never;
}

describe("outcome labelling", () => {
  it("ranks a win above every other decision", () => {
    const targets = (["WON", "APPLIED", "CONTACTED", "LOST", "ARCHIVED"] as OpportunityStatus[]).map(
      (s) => OUTCOME_LABELS[s]!.target,
    );
    expect(targets).toEqual([...targets].sort((a, b) => b - a));
  });

  it("treats a lost bid as better than an outright discard", () => {
    expect(OUTCOME_LABELS.LOST!.target).toBeGreaterThan(OUTCOME_LABELS.ARCHIVED!.target);
  });

  it("trusts real effort more than a shrug", () => {
    expect(OUTCOME_LABELS.WON!.weight).toBeGreaterThan(OUTCOME_LABELS.WATCH!.weight);
    expect(OUTCOME_LABELS.ARCHIVED!.weight).toBeGreaterThan(OUTCOME_LABELS.INTERESTING!.weight);
  });

  it("keeps every target and weight inside 0..1", () => {
    for (const label of Object.values(OUTCOME_LABELS)) {
      if (!label) continue;
      expect(label.target).toBeGreaterThanOrEqual(0);
      expect(label.target).toBeLessThanOrEqual(1);
      expect(label.weight).toBeGreaterThan(0);
      expect(label.weight).toBeLessThanOrEqual(1);
    }
  });
});

describe("toOutcomeSample", () => {
  it("skips an untriaged lead", () => {
    expect(toOutcomeSample(row({ status: "NEW" }), 100000)).toBeNull();
  });

  it("labels a decided lead and derives its features", () => {
    const sample = toOutcomeSample(row(), 100000)!;
    expect(sample.status).toBe("WON");
    expect(sample.label.target).toBe(1);
    expect(sample.features).toContain("category:voucher");
    expect(sample.features).toContain("source:ehsys");
    expect(sample.features).toContain("budget:50k-100k");
    expect(sample.decidedAt).toBe("2026-01-15T10:00:00.000Z");
  });

  it("produces raw signals for every criterion it can", () => {
    const sample = toOutcomeSample(row(), 100000)!;
    expect(Object.keys(sample.raws).length).toBeGreaterThan(5);
    for (const value of Object.values(sample.raws)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("recoverRawSignals", () => {
  it("prefers the stored snapshot over recomputing", () => {
    // A deadline that has since expired: recomputing today would score
    // activeDeadline at 0 and destroy the signal the lead was judged on.
    const stored = {
      total: 70,
      computedAt: "2026-01-01T00:00:00.000Z",
      components: [
        { criterion: "activeDeadline", label: "Active deadline", weight: 0.1, raw: 1, contribution: 10 },
        { criterion: "budgetFit", label: "Budget fit", weight: 0.12, raw: 0.5, contribution: 6 },
      ],
    };
    const raws = recoverRawSignals(
      row({ scoreBreakdown: stored, deadline: new Date("2020-01-01T00:00:00.000Z") }),
      100000,
    );
    expect(raws.activeDeadline).toBe(1);
    expect(raws.budgetFit).toBe(0.5);
  });

  it("recomputes when no snapshot was ever stored", () => {
    const raws = recoverRawSignals(row({ scoreBreakdown: null }), 100000);
    expect(raws.budgetFit).toBe(1); // 90k is within the 100k preference
  });

  it("recomputes when the stored snapshot is empty", () => {
    const raws = recoverRawSignals(
      row({ scoreBreakdown: { total: 0, components: [], computedAt: "x" } }),
      100000,
    );
    expect(Object.keys(raws).length).toBeGreaterThan(5);
  });

  it("ignores non-numeric values in a stored snapshot", () => {
    const raws = recoverRawSignals(
      row({
        scoreBreakdown: {
          total: 1,
          computedAt: "x",
          components: [
            { criterion: "budgetFit", label: "b", weight: 0.1, raw: "oops", contribution: 1 },
            { criterion: "ambition", label: "a", weight: 0.1, raw: 0.3, contribution: 1 },
          ],
        },
      }),
      100000,
    );
    expect(raws.budgetFit).toBeUndefined();
    expect(raws.ambition).toBe(0.3);
  });
});
