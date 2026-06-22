import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    discoveryMission: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    discoveryLane: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    discoveryCandidate: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    evidence: {
      create: vi.fn(),
    },
  };
  return {
    db,
    runDiscoverySearch: vi.fn(),
    runAi: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/discovery", () => ({ runDiscoverySearch: mocks.runDiscoverySearch }));
vi.mock("@/lib/ai", () => ({ runAi: mocks.runAi }));

import { executeDiscoveryMission } from ".";

const lane = {
  id: "lane-1",
  slug: "funded-work",
  name: "Funded work",
  description: "Funded work",
  workspace: "DK" as const,
  sourceTypes: ["PUBLIC_WEB"],
  queryTemplates: ["software udbud"],
  positiveKeywords: ["software"],
  negativeKeywords: [],
  evidenceRequirements: [],
  scoringConfig: {},
  conversionGuidance: null,
  active: true,
  ownerId: "owner-1",
  createdAt: new Date("2026-06-22T10:00:00.000Z"),
  updatedAt: new Date("2026-06-22T10:00:00.000Z"),
};

const candidate = {
  id: "candidate-1",
  candidateKind: "opportunity" as const,
  title: "Concrete software opportunity",
  description: "A real software assignment.",
  rawContent: "A real software assignment.",
  url: "https://example.com/opportunity",
  organization: "Example buyer",
  category: "Software",
  sourceName: "Example",
  sourceKind: "web-search" as const,
  provider: "test",
  query: "software udbud",
  matchScore: 80,
  scoreBreakdown: { total: 80 },
  reasons: [],
  signals: [],
  freshness: "active" as const,
  applicationRoute: "UNKNOWN" as const,
  contacts: [],
  attachments: [],
};

const tenderLane = {
  ...lane,
  id: "tender-lane-1",
  slug: "tenders-procurement",
  name: "Tenders / procurement",
  queryTemplates: ["site:udbud.dk/detaljevisning software tilbudsfrist"],
  positiveKeywords: ["udbud", "software"],
  negativeKeywords: ["job", "archive"],
  evidenceRequirements: ["scope", "submission route", "deadline", "buyer"],
};

describe("discovery mission execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.discoveryMission.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.discoveryMission.update.mockResolvedValue({});
    mocks.db.discoveryMission.findFirst.mockResolvedValue({ status: "CANCELED" });
    mocks.db.discoveryMission.findFirstOrThrow.mockResolvedValue({
      id: "mission-1",
      status: "CANCELED",
      warnings: [],
      log: [],
      lane,
      candidates: [],
    });
    mocks.db.discoveryLane.findFirst.mockResolvedValue(lane);
    mocks.db.discoveryLane.upsert.mockResolvedValue({});
    mocks.db.discoveryCandidate.findFirst.mockResolvedValue(null);
    mocks.db.discoveryCandidate.create.mockResolvedValue({
      id: "created-candidate",
      evidence: [],
      lane,
    });
    mocks.db.discoveryCandidate.update.mockResolvedValue({
      id: "updated-candidate",
      evidence: [],
      lane,
    });
    mocks.db.evidence.create.mockResolvedValue({});
    mocks.runDiscoverySearch.mockResolvedValue({
      candidates: [candidate],
      queries: ["software udbud"],
      searchPlan: {
        queries: ["software udbud"],
        focusTerms: [],
        avoidTerms: [],
        rationale: "",
        usedAi: false,
      },
      provider: "test",
      providerConfigured: true,
      sourceScanCount: 0,
      warnings: [],
    });
  });

  it("keeps a canceled mission canceled when cancellation lands after search", async () => {
    const result = await executeDiscoveryMission("owner-1", "mission-1", {
      laneId: "lane-1",
      query: "software udbud",
      useAiPlanner: false,
      searchMode: "focused",
      maxResults: 8,
      includeWeb: true,
      includeSources: false,
      provider: "auto",
    });

    expect(result.mission.status).toBe("CANCELED");
    expect(result.candidates).toEqual([]);
    expect(mocks.db.discoveryCandidate.create).not.toHaveBeenCalled();
    expect(mocks.db.discoveryCandidate.update).not.toHaveBeenCalled();
    expect(mocks.db.discoveryMission.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCESS" }),
      }),
    );
    expect(mocks.db.discoveryMission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          log: expect.objectContaining({ push: expect.stringContaining("search results were discarded") }),
        }),
      }),
    );
  });

  it("creates a duplicate snapshot instead of moving an older mission candidate", async () => {
    mocks.db.discoveryMission.findFirst.mockResolvedValue({ status: "RUNNING" });
    mocks.db.discoveryMission.findFirstOrThrow.mockResolvedValue({
      id: "mission-2",
      status: "SUCCESS",
      warnings: [],
      log: [],
      lane,
      candidates: [],
    });
    mocks.db.discoveryCandidate.findFirst.mockResolvedValue({
      id: "existing-candidate",
      missionId: "older-mission",
      evidence: [{ id: "evidence-1" }],
      lane,
    });
    mocks.db.discoveryCandidate.create.mockResolvedValue({
      id: "duplicate-candidate",
      evidence: [],
      lane,
    });
    mocks.db.evidence.create.mockResolvedValue({});

    await executeDiscoveryMission("owner-1", "mission-2", {
      laneId: "lane-1",
      query: "software udbud",
      useAiPlanner: false,
      searchMode: "focused",
      maxResults: 8,
      includeWeb: true,
      includeSources: false,
      provider: "auto",
    });

    expect(mocks.db.discoveryCandidate.update).not.toHaveBeenCalled();
    expect(mocks.db.discoveryCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missionId: "mission-2",
          status: "DUPLICATE",
          reasons: expect.arrayContaining(["Rediscovered in this mission; matching candidate already exists."]),
        }),
      }),
    );
  });

  it("uses the official Danish tender index for focused auto tender missions", async () => {
    mocks.db.discoveryMission.findFirst.mockResolvedValue({ status: "RUNNING" });
    mocks.db.discoveryMission.findFirstOrThrow.mockResolvedValue({
      id: "mission-3",
      status: "SUCCESS",
      warnings: [],
      log: [],
      lane: tenderLane,
      candidates: [],
    });
    mocks.db.discoveryLane.findFirst.mockResolvedValue(tenderLane);
    mocks.runDiscoverySearch.mockResolvedValue({
      candidates: [],
      queries: ["site:udbud.dk/detaljevisning software tilbudsfrist"],
      searchPlan: {
        queries: ["site:udbud.dk/detaljevisning software tilbudsfrist"],
        focusTerms: [],
        avoidTerms: [],
        rationale: "",
        usedAi: false,
      },
      provider: "none",
      providerConfigured: true,
      sourceScanCount: 0,
      warnings: [],
    });

    await executeDiscoveryMission("owner-1", "mission-3", {
      laneId: "tender-lane-1",
      query: "software udbud",
      useAiPlanner: false,
      searchMode: "focused",
      maxResults: 8,
      includeWeb: true,
      includeSources: false,
      provider: "auto",
    });

    expect(mocks.runDiscoverySearch).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ provider: "none", resultKind: "opportunities" }),
    );
    expect(mocks.db.discoveryMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          log: expect.objectContaining({
            push: expect.stringContaining("official udbud.dk index"),
          }),
        }),
      }),
    );
  });
});
