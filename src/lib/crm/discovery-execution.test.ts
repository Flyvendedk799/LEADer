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
});
