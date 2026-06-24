import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaultDiscoveryLanes: vi.fn(),
  runDiscoveryMission: vi.fn(),
  db: {
    discoveryCandidate: {
      findMany: vi.fn(),
    },
    discoveryLane: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/crm", () => ({
  DEAL_INCLUDE: {},
  ensureAccount: vi.fn(),
  getCockpit: vi.fn(),
  runDiscoveryMission: mocks.runDiscoveryMission,
  saveCandidateAsDeal: vi.fn(),
}));
vi.mock("@/lib/crm/lanes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crm/lanes")>("@/lib/crm/lanes");
  return {
    ...actual,
    ensureDefaultDiscoveryLanes: mocks.ensureDefaultDiscoveryLanes,
  };
});

import { executeAgentTool } from "./tools";

const startupLane = {
  id: "lane-1",
  slug: "direct-startup-mvp",
  name: "Direct startup / MVP clients",
  queryTemplates: ["startup founder needs MVP developer Denmark"],
  positiveKeywords: ["founder", "startup", "MVP", "prototype", "technical partner", "fullstack", "roadmap"],
  negativeKeywords: ["cofounder only", "internship", "job posting only"],
  evidenceRequirements: ["explicit product or technical need", "reachable founder/company", "reason to act now"],
};

describe("agent CRM tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureDefaultDiscoveryLanes.mockResolvedValue(undefined);
  });

  it("hides off-lane discovery candidates from CRM search results", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      {
        id: "good-candidate",
        title: "Founder needs MVP prototype and fullstack technical partner",
        description: "Pre-seed startup wants a product roadmap and prototype sprint this month.",
        url: "https://example.com/founder-mvp-build",
        status: "NEW",
        pursuitScore: 92,
        lane: startupLane,
        evidence: [{ snippet: "Founder needs a paid MVP build sprint." }],
      },
      {
        id: "job-candidate",
        title: "Tech & Startup Jobs in Denmark | The Hub",
        description: "Full-time and part-time startup jobs.",
        url: "https://thehub.io/jobs/location/denmark/copenhagen",
        status: "NEW",
        pursuitScore: 91,
        lane: startupLane,
        evidence: [{ snippet: "Startup jobs board." }],
      },
    ]);

    const result = await executeAgentTool("owner-1", {
      tool: "search_crm",
      args: { entity: "candidates", status: "NEW", limit: 2 },
    });
    const data = result.data as { candidates: Array<{ id: string; title: string }> };

    expect(mocks.db.discoveryCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }),
    );
    expect(result.summary).toContain("1 candidates");
    expect(data.candidates.map((candidate) => candidate.id)).toEqual(["good-candidate"]);
  });

  it("returns a discovery mission link when the agent runs a lane", async () => {
    mocks.db.discoveryLane.findFirst.mockResolvedValue({
      id: "lane-1",
      slug: "sme-ai-automation",
      name: "SME AI automation",
    });
    mocks.runDiscoveryMission.mockResolvedValue({
      mission: { id: "mission-1", candidates: [] },
      queries: ["SME AI automation"],
      plan: null,
    });

    const result = await executeAgentTool("owner-1", {
      tool: "run_discovery_lane",
      args: { laneSlug: "sme-ai-automation", maxResults: 4 },
    });

    expect(mocks.runDiscoveryMission).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ laneId: "lane-1", maxResults: 4 }),
    );
    expect(result.data).toMatchObject({
      missionId: "mission-1",
      href: "/discover?mission=mission-1",
    });
  });
});
