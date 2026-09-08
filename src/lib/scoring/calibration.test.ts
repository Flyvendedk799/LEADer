import { describe, expect, it } from "vitest";
import {
  buildCalibration,
  calibratedWeights,
  confidenceFor,
  featureAdjustment,
  MIN_EFFECTIVE_SAMPLES,
  OUTCOME_LABELS,
  weightedCorrelation,
} from "./calibration";
import { opportunityFeatures, salientTokens } from "./features";
import { scoreOpportunity } from ".";
import type { OpportunityStatus, OutcomeSample, ScoreCriterion } from "@/lib/types";

function sample(
  id: string,
  status: OpportunityStatus,
  raws: Partial<Record<ScoreCriterion, number>>,
  features: string[] = [],
): OutcomeSample {
  const label = OUTCOME_LABELS[status];
  if (!label) throw new Error(`${status} carries no label`);
  return { id, status, label, raws, features };
}

/** n won/lost pairs where budgetFit tracks the outcome perfectly. */
function correlatedSamples(pairs: number): OutcomeSample[] {
  const out: OutcomeSample[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push(sample(`w${i}`, "WON", { budgetFit: 1, ambition: 0.5 }));
    out.push(sample(`a${i}`, "ARCHIVED", { budgetFit: 0, ambition: 0.5 }));
  }
  return out;
}

describe("weightedCorrelation", () => {
  it("is 0 when a signal never varies", () => {
    expect(weightedCorrelation([0.5, 0.5, 0.5], [1, 0, 0.5], [1, 1, 1])).toBe(0);
  });

  it("is 0 when the target never varies", () => {
    expect(weightedCorrelation([1, 0, 0.5], [0.5, 0.5, 0.5], [1, 1, 1])).toBe(0);
  });

  it("finds a perfect positive relationship", () => {
    expect(weightedCorrelation([0, 0.5, 1], [0, 0.5, 1], [1, 1, 1])).toBeCloseTo(1, 5);
  });

  it("finds a perfect negative relationship", () => {
    expect(weightedCorrelation([0, 0.5, 1], [1, 0.5, 0], [1, 1, 1])).toBeCloseTo(-1, 5);
  });

  it("lets weights dominate the fit", () => {
    // The third point contradicts the first two but is almost weightless.
    const r = weightedCorrelation([0, 1, 0], [0, 1, 1], [1, 1, 0.001]);
    expect(r).toBeGreaterThan(0.9);
  });
});

describe("confidenceFor", () => {
  it("trusts nothing without evidence", () => {
    expect(confidenceFor(0)).toBe(0);
    expect(confidenceFor(-5)).toBe(0);
  });

  it("reaches half trust at the half-confidence point", () => {
    expect(confidenceFor(12, 12)).toBeCloseTo(0.5, 5);
  });

  it("rises with evidence but never reaches certainty", () => {
    expect(confidenceFor(50)).toBeGreaterThan(confidenceFor(20));
    expect(confidenceFor(100000)).toBeLessThan(1);
  });
});

describe("buildCalibration", () => {
  it("changes nothing without outcomes", () => {
    const model = buildCalibration([]);
    expect(model.insufficientData).toBe(true);
    expect(model.confidence).toBe(0);
    expect(model.rawSampleCount).toBe(0);
    for (const c of model.criteria) {
      expect(c.correlation).toBe(0);
      expect(c.multiplier).toBe(1);
      expect(c.learnedWeight).toBeCloseTo(c.baseWeight, 6);
      expect(c.direction).toBe("flat");
    }
    expect(model.features).toEqual([]);
  });

  it("refuses to learn from too little evidence", () => {
    // Two "watch" rows carry 0.6 effective weight — far below the floor.
    const model = buildCalibration([
      sample("a", "WATCH", { budgetFit: 1 }),
      sample("b", "WATCH", { budgetFit: 0 }),
    ]);
    expect(model.sampleCount).toBeLessThan(MIN_EFFECTIVE_SAMPLES);
    expect(model.insufficientData).toBe(true);
    expect(model.confidence).toBe(0);
  });

  it("raises the weight of a criterion that tracks wins", () => {
    const model = buildCalibration(correlatedSamples(6));
    const budgetFit = model.criteria.find((c) => c.criterion === "budgetFit")!;

    expect(model.insufficientData).toBe(false);
    expect(budgetFit.correlation).toBeGreaterThan(0.9);
    expect(budgetFit.multiplier).toBeGreaterThan(1);
    expect(budgetFit.learnedWeight).toBeGreaterThan(budgetFit.baseWeight);
    expect(budgetFit.direction).toBe("up");
  });

  it("lowers the weight of a criterion that tracks discards", () => {
    const samples: OutcomeSample[] = [];
    for (let i = 0; i < 6; i++) {
      samples.push(sample(`w${i}`, "WON", { budgetFit: 0 }));
      samples.push(sample(`a${i}`, "ARCHIVED", { budgetFit: 1 }));
    }
    const budgetFit = buildCalibration(samples).criteria.find(
      (c) => c.criterion === "budgetFit",
    )!;

    expect(budgetFit.correlation).toBeLessThan(-0.9);
    expect(budgetFit.multiplier).toBeLessThan(1);
    expect(budgetFit.learnedWeight).toBeLessThan(budgetFit.baseWeight);
    expect(budgetFit.direction).toBe("down");
  });

  it("ignores a criterion that carries no information", () => {
    // `ambition` is 0.5 on every row, so it cannot explain anything.
    const ambition = buildCalibration(correlatedSamples(6)).criteria.find(
      (c) => c.criterion === "ambition",
    )!;
    expect(ambition.correlation).toBe(0);
    expect(ambition.multiplier).toBe(1);
  });

  it("keeps learned weights normalised", () => {
    const model = buildCalibration(correlatedSamples(8));
    const sum = model.criteria.reduce((acc, c) => acc + c.learnedWeight, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it("moves further from the prior as evidence accumulates", () => {
    const small = buildCalibration(correlatedSamples(3));
    const large = buildCalibration(correlatedSamples(40));
    const pick = (m: typeof small) => m.criteria.find((c) => c.criterion === "budgetFit")!;

    expect(large.confidence).toBeGreaterThan(small.confidence);
    expect(pick(large).multiplier).toBeGreaterThan(pick(small).multiplier);
  });

  it("respects hand-tuned base weights instead of overwriting them", () => {
    // budgetFit starts far above its default; learning sharpens, not replaces.
    const model = buildCalibration(correlatedSamples(6), { budgetFit: 0.5 });
    const budgetFit = model.criteria.find((c) => c.criterion === "budgetFit")!;
    expect(budgetFit.baseWeight).toBeGreaterThan(0.3);
    expect(budgetFit.learnedWeight).toBeGreaterThan(budgetFit.baseWeight);
  });

  it("counts outcomes by status", () => {
    const model = buildCalibration(correlatedSamples(2));
    expect(model.outcomeCounts.WON).toBe(2);
    expect(model.outcomeCounts.ARCHIVED).toBe(2);
  });

  it("learns which concrete features convert", () => {
    const samples: OutcomeSample[] = [];
    for (let i = 0; i < 6; i++) {
      samples.push(sample(`w${i}`, "WON", { budgetFit: 0.5 }, ["category:voucher"]));
      samples.push(sample(`a${i}`, "ARCHIVED", { budgetFit: 0.5 }, ["category:recruitment"]));
    }
    const model = buildCalibration(samples);
    const good = model.features.find((f) => f.feature === "category:voucher")!;
    const bad = model.features.find((f) => f.feature === "category:recruitment")!;

    expect(good.lift).toBeGreaterThan(0);
    expect(good.direction).toBe("up");
    expect(bad.lift).toBeLessThan(0);
    expect(bad.direction).toBe("down");
  });

  it("ignores a feature seen only once", () => {
    const samples = correlatedSamples(6);
    samples[0].features = ["token:fluke"];
    const model = buildCalibration(samples);
    expect(model.features.find((f) => f.feature === "token:fluke")).toBeUndefined();
  });
});

describe("calibratedWeights", () => {
  it("passes the base weights through when there is no model", () => {
    const base = { budgetFit: 0.3 };
    expect(calibratedWeights(base, null)).toBe(base);
    expect(calibratedWeights(base, undefined)).toBe(base);
  });

  it("passes the base weights through when the model is too thin", () => {
    const base = { budgetFit: 0.3 };
    expect(calibratedWeights(base, buildCalibration([]))).toBe(base);
  });

  it("returns learned weights once the model is usable", () => {
    const model = buildCalibration(correlatedSamples(10));
    const weights = calibratedWeights({}, model)!;
    expect(weights.budgetFit).toBeCloseTo(
      model.criteria.find((c) => c.criterion === "budgetFit")!.learnedWeight,
      6,
    );
  });
});

describe("featureAdjustment", () => {
  const model = (() => {
    const samples: OutcomeSample[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push(sample(`w${i}`, "WON", { budgetFit: 0.5 }, ["category:voucher"]));
      samples.push(sample(`a${i}`, "ARCHIVED", { budgetFit: 0.5 }, ["category:recruitment"]));
    }
    return buildCalibration(samples);
  })();

  it("does nothing without a usable model", () => {
    expect(featureAdjustment(["category:voucher"], null)).toBeNull();
    expect(featureAdjustment(["category:voucher"], buildCalibration([]))).toBeNull();
  });

  it("does nothing when no feature matches", () => {
    expect(featureAdjustment(["category:unseen"], model)).toBeNull();
    expect(featureAdjustment([], model)).toBeNull();
  });

  it("rewards features that convert and penalises those that don't", () => {
    expect(featureAdjustment(["category:voucher"], model)!.adjustment).toBeGreaterThan(0);
    expect(featureAdjustment(["category:recruitment"], model)!.adjustment).toBeLessThan(0);
  });

  it("stays inside the point cap however many features match", () => {
    const many = model.features.map((f) => f.feature);
    const trace = featureAdjustment(many, model)!;
    expect(Math.abs(trace.adjustment)).toBeLessThanOrEqual(12);
  });

  it("explains itself", () => {
    const trace = featureAdjustment(["category:voucher"], model)!;
    expect(trace.applied).toBe(true);
    expect(trace.matchedFeatures[0].label).toBe("Category: voucher");
    expect(trace.sampleCount).toBeGreaterThan(0);
  });
});

describe("scoreOpportunity with calibration", () => {
  const lead = {
    title: "AI automation MVP for Danish SME",
    description: "Fullstack developer needed to build a prototype platform.",
    budgetMax: 90000,
    category: "voucher",
    applicationRoute: "DIRECT",
  };

  it("is unchanged when no calibration is supplied", () => {
    const plain = scoreOpportunity(lead);
    const withNull = scoreOpportunity(lead, { calibration: null });
    expect(withNull.total).toBe(plain.total);
    expect(withNull.calibration).toBeUndefined();
  });

  it("is unchanged by a model that has not learned anything", () => {
    const plain = scoreOpportunity(lead);
    const untrained = scoreOpportunity(lead, { calibration: buildCalibration([]) });
    expect(untrained.total).toBe(plain.total);
    expect(untrained.calibration).toBeUndefined();
  });

  it("lifts a lead that matches a converting feature, and records why", () => {
    const samples: OutcomeSample[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push(sample(`w${i}`, "WON", { budgetFit: 0.5 }, ["category:voucher"]));
      samples.push(sample(`a${i}`, "ARCHIVED", { budgetFit: 0.5 }, ["category:other"]));
    }
    const calibration = buildCalibration(samples);

    const plain = scoreOpportunity(lead);
    const calibrated = scoreOpportunity(lead, { calibration });

    expect(calibrated.total).toBeGreaterThan(plain.total);
    expect(calibrated.calibration?.applied).toBe(true);
    expect(calibrated.calibration?.matchedFeatures.length).toBeGreaterThan(0);
  });

  it("never leaves the 0..100 range", () => {
    const samples: OutcomeSample[] = [];
    for (let i = 0; i < 40; i++) {
      samples.push(sample(`w${i}`, "WON", { budgetFit: 0.5 }, ["category:voucher"]));
      samples.push(sample(`a${i}`, "ARCHIVED", { budgetFit: 0.5 }, ["category:other"]));
    }
    const calibration = buildCalibration(samples);
    for (const candidate of [lead, { title: "x" }, { title: "voucher", category: "voucher" }]) {
      const total = scoreOpportunity(candidate, { calibration }).total;
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(100);
    }
  });
});

describe("feature extraction", () => {
  it("derives stable keys from an opportunity", () => {
    const features = opportunityFeatures({
      title: "Fullstack MVP for startup",
      organization: "Erhvervshus Midtjylland",
      category: "Voucher",
      applicationRoute: "DIRECT",
      workspace: "DK",
      budgetMax: 80000,
      source: { name: "EHSYS" },
    });

    expect(features).toContain("source:ehsys");
    expect(features).toContain("category:voucher");
    expect(features).toContain("route:direct");
    expect(features).toContain("workspace:dk");
    expect(features).toContain("budget:50k-100k");
    expect(features).toContain("token:fullstack");
  });

  it("bands budgets and marks a missing one", () => {
    expect(opportunityFeatures({ title: "a" })).toContain("budget:unknown");
    expect(opportunityFeatures({ title: "a", budgetMax: 20000 })).toContain("budget:under-50k");
    expect(opportunityFeatures({ title: "a", budgetMax: 2_000_000 })).toContain("budget:over-1m");
  });

  it("produces no duplicate keys", () => {
    const features = opportunityFeatures({
      title: "voucher voucher voucher",
      category: "voucher",
    });
    expect(new Set(features).size).toBe(features.length);
  });

  it("drops stopwords, short words and bare numbers", () => {
    const tokens = salientTokens("the udvikler skal 2024 med automatisering");
    expect(tokens).toContain("udvikler");
    expect(tokens).toContain("automatisering");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("med");
    expect(tokens).not.toContain("skal");
    expect(tokens).not.toContain("2024");
  });
});
