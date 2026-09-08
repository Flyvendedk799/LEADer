/**
 * End-to-end behaviour of the outcome loop.
 *
 * The unit tests in `calibration.test.ts` pin the maths. This pins the thing the
 * feature actually promises: an owner with a consistent preference gets leads
 * ranked their way — including leads from sources the model has never seen,
 * which is what separates learning from memorising.
 */
import { describe, expect, it } from "vitest";
import { buildCalibration, OUTCOME_LABELS } from "./calibration";
import { opportunityFeatures } from "./features";
import { scoreOpportunity } from ".";
import type { OpportunityStatus, OutcomeSample } from "@/lib/types";

type Lead = Record<string, unknown>;
const soon = () => new Date(Date.now() + 21 * 86400000);

/** Small Erhvervshus voucher AI/MVP work — the work this owner wins. */
function goodLead(i: number): Lead {
  return {
    title: `AI automation MVP prototype for SME ${i}`,
    description: "Fullstack developer to build an AI automation prototype platform.",
    organization: "Erhvervshus Midtjylland",
    category: "voucher",
    applicationRoute: "DIRECT",
    workspace: "DK",
    budgetMax: 85000,
    sourceName: "EHSYS",
    deadline: soon(),
  };
}

/** Large public hardware/staffing frameworks — the work this owner discards. */
function badLead(i: number): Lead {
  return {
    title: `Rammeaftale hardware indkoeb rekruttering ${i}`,
    description: "Public framework agreement for hardware procurement and staffing.",
    organization: "Region Hovedstaden",
    category: "hardware",
    applicationRoute: "APPLICATION",
    workspace: "DK",
    budgetMax: 4_000_000,
    sourceName: "udbud.dk",
    deadline: soon(),
  };
}

function sampleFrom(id: string, lead: Lead, status: OpportunityStatus): OutcomeSample {
  const label = OUTCOME_LABELS[status]!;
  const breakdown = scoreOpportunity(lead as never);
  const raws: Record<string, number> = {};
  for (const c of breakdown.components) raws[c.criterion] = c.raw;
  return { id, status, label, raws: raws as never, features: opportunityFeatures(lead as never) };
}

/** A year of coherent decisions: wins on the good shape, discards on the bad. */
function trainedModel() {
  const history: OutcomeSample[] = [];
  for (let i = 0; i < 12; i++) {
    history.push(sampleFrom(`g${i}`, goodLead(i), i % 3 === 0 ? "WON" : "APPLIED"));
    history.push(sampleFrom(`b${i}`, badLead(i), i % 4 === 0 ? "LOST" : "ARCHIVED"));
  }
  return buildCalibration(history);
}

describe("outcome loop, end to end", () => {
  const model = trainedModel();

  it("learns a usable model from a coherent history", () => {
    expect(model.insufficientData).toBe(false);
    expect(model.rawSampleCount).toBe(24);
    expect(model.confidence).toBeGreaterThan(0.5);
  });

  it("identifies the criteria that actually separated the outcomes", () => {
    const top = model.criteria[0];
    expect(Math.abs(top.correlation)).toBeGreaterThan(0.8);
  });

  it("learns concrete negative features from the discarded work", () => {
    const keys = model.features.map((f) => f.feature);
    expect(keys).toContain("category:hardware");
    expect(keys).toContain("budget:over-1m");
    for (const f of model.features.filter((x) => keys.includes(x.feature))) {
      if (f.feature === "category:hardware") expect(f.direction).toBe("down");
    }
  });

  it("promotes wanted work and demotes unwanted work", () => {
    const wantedBefore = scoreOpportunity(goodLead(99) as never).total;
    const wantedAfter = scoreOpportunity(goodLead(99) as never, { calibration: model }).total;
    const unwantedBefore = scoreOpportunity(badLead(99) as never).total;
    const unwantedAfter = scoreOpportunity(badLead(99) as never, { calibration: model }).total;

    expect(wantedAfter).toBeGreaterThan(wantedBefore);
    expect(unwantedAfter).toBeLessThan(unwantedBefore);
    // The gap the owner cares about widens.
    expect(wantedAfter - unwantedAfter).toBeGreaterThan(wantedBefore - unwantedBefore);
  });

  it("generalises to sources and organisations it has never seen", () => {
    // Neither name appears anywhere in the training history — only the shared
    // shape (category, budget band, salient words) carries the signal across.
    const unseenGood = {
      ...goodLead(98),
      sourceName: "Beyond Beta",
      organization: "Erhvervshus Syd",
    };
    const unseenBad = { ...badLead(98), sourceName: "Nyt udbud", organization: "Kommune X" };

    expect(scoreOpportunity(unseenGood as never, { calibration: model }).total).toBeGreaterThan(
      scoreOpportunity(unseenGood as never).total,
    );
    expect(scoreOpportunity(unseenBad as never, { calibration: model }).total).toBeLessThan(
      scoreOpportunity(unseenBad as never).total,
    );
  });

  it("explains every adjustment it makes", () => {
    const scored = scoreOpportunity(goodLead(99) as never, { calibration: model });
    expect(scored.calibration?.applied).toBe(true);
    expect(scored.calibration?.matchedFeatures.length).toBeGreaterThan(0);
    expect(scored.calibration?.sampleCount).toBeGreaterThan(0);
  });

  it("leaves every score untouched when nothing has been decided", () => {
    const untrained = buildCalibration([]);
    for (const lead of [goodLead(1), badLead(1)]) {
      expect(scoreOpportunity(lead as never, { calibration: untrained }).total).toBe(
        scoreOpportunity(lead as never).total,
      );
    }
  });
});
