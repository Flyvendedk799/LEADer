import { describe, expect, it } from "vitest";

import { __discoveryTesting } from ".";

const { buildFeedbackSignalModel, evaluateFeedbackSignal, feedbackFeaturesFromCandidate } =
  __discoveryTesting;

describe("discovery feedback learning", () => {
  it("penalizes similar candidates after a non-lead label", () => {
    const features = feedbackFeaturesFromCandidate({
      title: "Guide til IT-udbud",
      url: "https://example.dk/raadgivning/it-udbud",
      candidateKind: "opportunity",
      sourceName: "Example rådgivning",
      query: "software udbud",
    });
    const model = buildFeedbackSignalModel([
      {
        candidateId: "non-lead-1",
        feedback: "NON_LEAD",
        title: "Guide til IT-udbud",
        url: "https://example.dk/raadgivning/it-udbud",
        candidateKind: "opportunity",
        sourceName: "Example rådgivning",
        query: "software udbud",
        features,
      },
    ]);

    const insight = evaluateFeedbackSignal(model, {
      id: "new-candidate",
      title: "IT-udbud guide for leverandører",
      url: "https://example.dk/raadgivning/offentlige-udbud",
      candidateKind: "opportunity",
      sourceName: "Example rådgivning",
      query: "software udbud",
    });

    expect(insight.delta).toBeLessThan(0);
    expect(insight.signals).toContain("learned non-lead");
  });

  it("boosts similar candidates after a saved good result", () => {
    const features = feedbackFeaturesFromCandidate({
      title: "Teknisk sparring om produktroadmap",
      url: "https://beyondbeta.ehsys.dk/indkoeb/tilbud/indsend/abc",
      candidateKind: "opportunity",
      sourceName: "EHSYS",
      query: "software udbud",
      signals: ["technical fit", "supplier lead"],
    });
    const model = buildFeedbackSignalModel([
      {
        candidateId: "good-1",
        feedback: "GOOD_RESULT",
        title: "Teknisk sparring om produktroadmap",
        url: "https://beyondbeta.ehsys.dk/indkoeb/tilbud/indsend/abc",
        candidateKind: "opportunity",
        sourceName: "EHSYS",
        query: "software udbud",
        features,
      },
    ]);

    const insight = evaluateFeedbackSignal(model, {
      id: "new-good-candidate",
      title: "Teknisk roadmap og produkt sparring",
      url: "https://beyondbeta.ehsys.dk/indkoeb/tilbud/indsend/def",
      candidateKind: "opportunity",
      sourceName: "EHSYS",
      query: "software udbud",
      signals: ["technical fit", "supplier lead"],
    });

    expect(insight.delta).toBeGreaterThan(0);
    expect(insight.signals).toContain("learned good");
  });
});
