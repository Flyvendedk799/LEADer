import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  db: {
    discoveryCandidate: {
      count: vi.fn(),
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

  it("returns unreviewed leads, open tasks, and overdue tasks for default (DK) workspace", async () => {
    mocks.db.discoveryCandidate.count.mockResolvedValue(12);
    mocks.db.task.count
      .mockResolvedValueOnce(5) // openTasks
      .mockResolvedValueOnce(2); // overdueTasks

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      unreviewedLeads: 12,
      openTasks: 5,
      overdueTasks: 2,
    });

    expect(mocks.db.discoveryCandidate.count).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        workspace: "DK",
        status: { in: ["NEW", "REVIEWED"] },
      },
    });

    expect(mocks.db.task.count).toHaveBeenNthCalledWith(1, {
      where: {
        ownerId: "owner-1",
        status: "OPEN",
      },
    });

    expect(mocks.db.task.count).toHaveBeenNthCalledWith(2, {
      where: {
        ownerId: "owner-1",
        status: "OPEN",
        dueAt: { lt: expect.any(Date) },
      },
    });
  });

  it("handles GLOBAL workspace parameter correctly", async () => {
    mocks.db.discoveryCandidate.count.mockResolvedValue(4);
    mocks.db.task.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const res = await GET(getRequest("?workspace=GLOBAL"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      unreviewedLeads: 4,
      openTasks: 1,
      overdueTasks: 0,
    });

    expect(mocks.db.discoveryCandidate.count).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        workspace: "GLOBAL",
        status: { in: ["NEW", "REVIEWED"] },
      },
    });
  });

  it("falls back to DK workspace when workspace parameter is not GLOBAL", async () => {
    mocks.db.discoveryCandidate.count.mockResolvedValue(0);
    mocks.db.task.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const res = await GET(getRequest("?workspace=OTHER"));
    expect(res.status).toBe(200);

    expect(mocks.db.discoveryCandidate.count).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        workspace: "DK",
        status: { in: ["NEW", "REVIEWED"] },
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
    mocks.db.discoveryCandidate.count.mockRejectedValue(new Error("DB failure"));

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("DB failure");
  });
});
