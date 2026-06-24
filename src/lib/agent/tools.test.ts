import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaultDiscoveryLanes: vi.fn(),
  createDiscoveryMission: vi.fn(),
  discoveryQueueSnapshot: vi.fn(),
  enqueueDiscoveryMission: vi.fn(),
  visibleDiscoveryQueueSnapshotForOwner: vi.fn(),
  db: {
    discoveryCandidate: {
      findMany: vi.fn(),
    },
    discoveryMission: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    discoveryLane: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/crm", () => ({
  DEAL_INCLUDE: {},
  createDiscoveryMission: mocks.createDiscoveryMission,
  ensureAccount: vi.fn(),
  getCockpit: vi.fn(),
  saveCandidateAsDeal: vi.fn(),
}));
vi.mock("@/lib/crm/discovery-queue", () => ({
  discoveryQueueSnapshot: mocks.discoveryQueueSnapshot,
  enqueueDiscoveryMission: mocks.enqueueDiscoveryMission,
  visibleDiscoveryQueueSnapshotForOwner: mocks.visibleDiscoveryQueueSnapshotForOwner,
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
    mocks.db.discoveryMission.findMany.mockResolvedValue([]);
    mocks.db.discoveryMission.update.mockResolvedValue({});
    mocks.discoveryQueueSnapshot.mockReturnValue({ activeMissionId: "mission-1", queuedMissionIds: [] });
    mocks.enqueueDiscoveryMission.mockReturnValue(true);
    mocks.visibleDiscoveryQueueSnapshotForOwner.mockResolvedValue({ activeMissionId: null, queuedMissionIds: [] });
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

  it("queues a discovery mission and returns a durable link", async () => {
    mocks.db.discoveryLane.findFirst.mockResolvedValue({
      id: "lane-1",
      slug: "sme-ai-automation",
      name: "SME AI automation",
    });
    mocks.createDiscoveryMission.mockResolvedValue({
      id: "mission-1",
      candidates: [],
    });

    const result = await executeAgentTool("owner-1", {
      tool: "run_discovery_lane",
      args: { laneSlug: "sme-ai-automation", maxResults: 4, workspace: "GLOBAL" },
    });

    expect(mocks.createDiscoveryMission).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ laneId: "lane-1", maxResults: 4, workspace: "GLOBAL" }),
      "QUEUED",
    );
    expect(mocks.enqueueDiscoveryMission).toHaveBeenCalledWith(
      "owner-1",
      "mission-1",
      expect.objectContaining({ laneId: "lane-1", maxResults: 4, workspace: "GLOBAL" }),
    );
    expect(result.title).toBe("Discovery mission queued");
    expect(result.summary).toContain("background");
    expect(result.data).toMatchObject({
      missionId: "mission-1",
      status: "QUEUED",
      href: "/discover?mission=mission-1",
    });
  });

  it("reuses an already active matching discovery mission", async () => {
    mocks.db.discoveryLane.findFirst.mockResolvedValue({
      id: "lane-1",
      slug: "sme-ai-automation",
      name: "SME AI automation",
    });
    mocks.db.discoveryMission.findMany.mockResolvedValue([
      {
        id: "mission-1",
        status: "QUEUED",
        finishedAt: null,
        workspace: "DK",
        input: {
          laneId: "lane-1",
          searchMode: "balanced",
          useAiPlanner: true,
          requiredTerms: [],
          excludedTerms: [],
          maxResults: 4,
          includeWeb: true,
          includeSources: true,
          provider: "auto",
          workspace: "DK",
        },
      },
    ]);
    mocks.visibleDiscoveryQueueSnapshotForOwner.mockResolvedValue({ activeMissionId: null, queuedMissionIds: ["mission-1"] });

    const result = await executeAgentTool("owner-1", {
      tool: "run_discovery_lane",
      args: { laneSlug: "sme-ai-automation", maxResults: 4 },
    });

    expect(mocks.createDiscoveryMission).not.toHaveBeenCalled();
    expect(result.title).toBe("Discovery mission already active");
    expect(result.data).toMatchObject({
      missionId: "mission-1",
      href: "/discover?mission=mission-1",
      queue: { queuedMissionIds: ["mission-1"] },
    });
  });
});
