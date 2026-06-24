import { describe, expect, it } from "vitest";

import { __discoveryTesting } from ".";

const {
  buildFeedbackSignalModel,
  buildSearchPlan,
  deterministicSearchPlan,
  evaluateFeedbackSignal,
  feedbackFeaturesFromCandidate,
  runSearchQueriesWithConcurrency,
  savedCandidateMatch,
} =
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

  it("builds richer deterministic search plans with avoid terms", () => {
    const plan = deterministicSearchPlan(
      "software udbud",
      "DK",
      "opportunities",
      {
        goodExamples: ["Teknisk roadmap · Beyond Beta"],
        savedSources: ["EHSYS aktuelle indkøb"],
        nonLeadExamples: ["Guide til IT-udbud"],
        goodTerms: ["roadmap", "prototype"],
        nonLeadTerms: ["guide", "artikel"],
      },
    );

    expect(plan.queries.length).toBeGreaterThan(3);
    expect(plan.queries.some((query) => query.includes("tilbudsfrist"))).toBe(true);
    expect(plan.avoidTerms).toContain("guide");
    expect(plan.usedAi).toBe(false);
  });

  it("runs search probes with bounded concurrency while preserving query order", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await runSearchQueriesWithConcurrency(
      ["first", "second", "third", "fourth"],
      1,
      2,
      async (query) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, query === "first" ? 12 : 1));
        active -= 1;
        return [{ title: query, provider: "test", query }];
      },
    );

    expect(maxActive).toBe(2);
    expect(results.map((result) => result.title)).toEqual(["first", "second", "third", "fourth"]);
  });

  it("keeps Danish search anchors in deterministic international plans", () => {
    const plan = deterministicSearchPlan(
      "AI automatisering for SaaS founders",
      "GLOBAL",
      "opportunities",
      {
        goodExamples: [],
        savedSources: [],
        nonLeadExamples: [],
        goodTerms: [],
        nonLeadTerms: ["course"],
      },
    );
    const queryText = plan.queries.join(" ").toLowerCase();

    expect(queryText).toContain("international");
    expect(queryText).toMatch(/dansk|fjernarbejde|softwareudvikling|leverandør|tilskud/);
    expect(plan.rationale).toContain("dansk søgeintention");
    expect(plan.usedAi).toBe(false);
  });

  it("ignores mock AI search plans when no real model is configured", async () => {
    const originalKey = process.env.LLM_API_KEY;
    process.env.LLM_API_KEY = "";

    try {
      const plan = await buildSearchPlan(
        "custom crm portal udbud",
        "DK",
        "opportunities",
        {
          id: "user-1",
          headline: "Solo fullstack engineer",
          bio: "Builds software and AI tools",
          preferredProjectTypes: ["fullstack", "AI"],
          excludedCategories: [],
          budgetMaxDkk: 100000,
          scoringWeights: {},
          aiKeys: null,
        },
        {
          goodExamples: [],
          savedSources: [],
          nonLeadExamples: [],
          goodTerms: [],
          nonLeadTerms: [],
        },
      );

      expect(plan.usedAi).toBe(false);
      expect(plan.queries[0]).toContain("custom crm portal udbud");
      expect(plan.queries[0]).not.toContain("software udbud Danmark teknisk sparring");
    } finally {
      if (originalKey === undefined) {
        delete process.env.LLM_API_KEY;
      } else {
        process.env.LLM_API_KEY = originalKey;
      }
    }
  });

  it("matches manually saved opportunities by exact title key", () => {
    const match = savedCandidateMatch(
      {
        id: "candidate-1",
        candidateKind: "opportunity",
        title: "Teknisk sparring om produktroadmap",
        freshness: "active",
        applicationRoute: "APPLICATION",
        contacts: [],
        attachments: [],
        sourceName: "Discover",
        sourceKind: "web-search",
        provider: "test",
        query: "software udbud",
        matchScore: 75,
        scoreBreakdown: { total: 75, components: [], computedAt: new Date().toISOString() },
        reasons: [],
        signals: [],
      },
      {
        opportunityHashes: new Set(),
        opportunityUrls: new Set(),
        opportunityTitleKeys: new Set(["teknisk sparring om produktroadmap"]),
        sourceUrls: new Set(),
      },
    );

    expect(match).toBe("opportunity");
  });
});
