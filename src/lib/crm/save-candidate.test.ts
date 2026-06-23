import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    account: {
      upsert: vi.fn(),
    },
    deal: {
      create: vi.fn(),
    },
    discoveryCandidate: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    discoveryLane: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    evidence: {
      create: vi.fn(),
    },
  };
  return { db, runAi: vi.fn(), runDiscoverySearch: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/ai", () => ({ runAi: mocks.runAi }));
vi.mock("@/lib/discovery", () => ({ runDiscoverySearch: mocks.runDiscoverySearch }));

import { saveCandidateAsDeal } from ".";

const tenderLane = {
  id: "lane-1",
  slug: "tenders-procurement",
  name: "Tenders / procurement",
  queryTemplates: ["site:udbud.dk/detaljevisning software tilbudsfrist"],
  positiveKeywords: ["udbud", "tender", "software", "IT"],
  negativeKeywords: ["arkiv", "archive", "job"],
  evidenceRequirements: ["scope", "submission route", "deadline", "buyer"],
};

describe("saveCandidateAsDeal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses stale off-lane tender candidates before creating a deal", async () => {
    mocks.db.discoveryCandidate.findFirst.mockResolvedValue({
      id: "candidate-1",
      title: "Udbud_076502.pdf",
      description: "Softwareudvikling med CV'er og tilbud.",
      rawContent: null,
      url: "https://udbud.dk/udbud/arkiv/udbud/76502/vedhaeftning/Udbud_076502.pdf",
      organization: null,
      sourceName: "Udbud",
      sourceKind: "web-search",
      category: "Tender",
      workspace: "DK",
      currency: "DKK",
      budgetMin: null,
      budgetMax: null,
      deadline: null,
      applicationRoute: "UNKNOWN",
      matchScore: 48,
      confidenceScore: 80,
      pursuitScore: 48,
      reasons: [],
      signals: [],
      evidence: [],
      deal: null,
      lane: tenderLane,
    });

    await expect(saveCandidateAsDeal("owner-1", "candidate-1")).rejects.toThrow(
      "Candidate is no longer a valid Tenders / procurement lead: archived tender URL",
    );
    expect(mocks.db.account.upsert).not.toHaveBeenCalled();
    expect(mocks.db.deal.create).not.toHaveBeenCalled();
    expect(mocks.db.discoveryCandidate.update).not.toHaveBeenCalled();
  });
});
