import { beforeEach, describe, expect, it, vi } from "vitest";
import { taskWorkspaceWhere } from "@/lib/tasks/scope";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  db: {
    discoveryCandidate: {
      findMany: vi.fn(),
    },
    task: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireOwnerId: mocks.requireOwnerId,
  };
});
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { UnauthorizedError } from "@/lib/auth";
import { GET } from "./route";

function getRequest(query = "") {
  return new Request(`http://localhost/api/nav/counts${query}`);
}

describe("GET /api/nav/counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerId.mockResolvedValue("owner-1");
  });

  it("returns unreviewed leads, open tasks, and overdue tasks for default (DK) workspace with taskWorkspaceWhere scoping", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      {
        id: "cand-1",
        title: "Kommune søger leverandør til AI-workflow",
        description: "Projektet er finansieret af tilskud; udbud af softwareudvikling",
        lane: {
          slug: "funded-work",
          name: "Funded work",
        },
      },
    ]);
    mocks.db.task.count
      .mockResolvedValueOnce(5) // openTasks
      .mockResolvedValueOnce(2); // overdueTasks

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      unreviewedLeads: 1,
      openTasks: 5,
      overdueTasks: 2,
    });

    expect(mocks.db.discoveryCandidate.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        workspace: "DK",
        status: { in: ["NEW", "REVIEWED"] },
      },
      include: { lane: true },
    });

    const expectedTaskWhere = taskWorkspaceWhere("DK");
    // Verify personal tasks clause is present in the taskWorkspaceWhere scope
    expect(expectedTaskWhere).toEqual({
      OR: [
        { deal: { workspace: "DK" } },
        { dealId: null, account: { workspace: "DK" } },
        { dealId: null, accountId: null },
      ],
    });

    expect(mocks.db.task.count).toHaveBeenNthCalledWith(1, {
      where: {
        ownerId: "owner-1",
        ...expectedTaskWhere,
        status: "OPEN",
      },
    });

    expect(mocks.db.task.count).toHaveBeenNthCalledWith(2, {
      where: {
        ownerId: "owner-1",
        ...expectedTaskWhere,
        status: "OPEN",
        dueAt: { lt: expect.any(Date) },
      },
    });
  });

  it("filters out recruiting-only and hidden candidates using filterVisibleLaneCandidates", async () => {
    const startupLane = {
      slug: "direct-startup-mvp",
      name: "Direct startup / MVP clients",
      queryTemplates: [],
      positiveKeywords: ["startup", "MVP"],
      negativeKeywords: ["recruitment", "job posting"],
      evidenceRequirements: [],
    };

    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      {
        id: "cand-valid",
        title: "Startup founder needs MVP developer",
        description: "Pre-seed startup needs technical partner to build product prototype",
        url: "https://example.com/project",
        lane: startupLane,
      },
      {
        id: "cand-recruiting",
        title: "Hiring Senior React Developer - Full-time Job",
        description: "Standard job posting looking for full-time employee",
        url: "https://thehub.io/jobs/123",
        lane: startupLane,
      },
    ]);
    mocks.db.task.count.mockResolvedValue(0);

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    // cand-recruiting is gated out by laneCandidateGate, so only 1 lead is counted
    expect(json.unreviewedLeads).toBe(1);
  });

  it("handles GLOBAL workspace parameter and workspace isolation correctly", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([]);
    mocks.db.task.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

    const res = await GET(getRequest("?workspace=GLOBAL"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      unreviewedLeads: 0,
      openTasks: 3,
      overdueTasks: 1,
    });

    expect(mocks.db.discoveryCandidate.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        workspace: "GLOBAL",
        status: { in: ["NEW", "REVIEWED"] },
      },
      include: { lane: true },
    });

    const expectedGlobalTaskWhere = taskWorkspaceWhere("GLOBAL");
    expect(expectedGlobalTaskWhere).toEqual({
      OR: [
        { deal: { workspace: "GLOBAL" } },
        { dealId: null, account: { workspace: "GLOBAL" } },
        { dealId: null, accountId: null },
      ],
    });
    expect(mocks.db.task.count).toHaveBeenNthCalledWith(1, {
      where: {
        ownerId: "owner-1",
        ...expectedGlobalTaskWhere,
        status: "OPEN",
      },
    });
    expect(mocks.db.task.count).toHaveBeenNthCalledWith(2, {
      where: {
        ownerId: "owner-1",
        ...expectedGlobalTaskWhere,
        status: "OPEN",
        dueAt: { lt: expect.any(Date) },
      },
    });
  });

  it("falls back to DK workspace when workspace parameter is not GLOBAL", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([]);
    mocks.db.task.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const res = await GET(getRequest("?workspace=OTHER"));
    expect(res.status).toBe(200);

    expect(mocks.db.discoveryCandidate.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        workspace: "DK",
        status: { in: ["NEW", "REVIEWED"] },
      },
      include: { lane: true },
    });

    expect(mocks.db.task.count).toHaveBeenNthCalledWith(1, {
      where: {
        ownerId: "owner-1",
        ...taskWorkspaceWhere("DK"),
        status: "OPEN",
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireOwnerId.mockRejectedValue(new UnauthorizedError());

    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Not authenticated");
  });

  it("returns 500 when database fails", async () => {
    mocks.db.discoveryCandidate.findMany.mockRejectedValue(new Error("DB failure"));

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("DB failure");
  });
});
