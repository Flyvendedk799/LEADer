import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    discoveryCandidate: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

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
});
