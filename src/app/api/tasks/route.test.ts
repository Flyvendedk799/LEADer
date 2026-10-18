import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  assertOwnedLinks: vi.fn(),
  db: {
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
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
vi.mock("@/lib/crm/ownership", () => ({
  assertOwnedLinks: mocks.assertOwnedLinks,
}));

import { GET, PATCH, POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerId.mockResolvedValue("owner-1");
    mocks.assertOwnedLinks.mockResolvedValue(undefined);
  });

  it("creates a task with default priority MEDIUM when omitted", async () => {
    const dueAt = new Date("2026-11-01T10:00:00.000Z");
    mocks.db.task.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "task-1", ...data }),
    );

    const res = await POST(
      postRequest({
        title: "Follow up with client",
        dealId: "deal-1",
        accountId: "account-1",
        dueAt: dueAt.toISOString(),
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.priority).toBe("MEDIUM");
    expect(json.title).toBe("Follow up with client");
    expect(json.dealId).toBe("deal-1");
    expect(json.accountId).toBe("account-1");

    expect(mocks.db.task.create).toHaveBeenCalledWith({
      data: {
        ownerId: "owner-1",
        title: "Follow up with client",
        dealId: "deal-1",
        accountId: "account-1",
        status: "OPEN",
        priority: "MEDIUM",
        dueAt,
      },
    });
  });

  it("creates a task with explicit priority (LOW, HIGH, URGENT)", async () => {
    const priorities = ["LOW", "HIGH", "URGENT"] as const;

    for (const priority of priorities) {
      mocks.db.task.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: "task-1", ...data }),
      );

      const res = await POST(
        postRequest({
          title: `Task with ${priority}`,
          priority,
        }),
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.priority).toBe(priority);
      expect(mocks.db.task.create).toHaveBeenCalledWith({
        data: {
          ownerId: "owner-1",
          title: `Task with ${priority}`,
          status: "OPEN",
          priority,
        },
      });
    }
  });

  it("rejects task creation with invalid priority", async () => {
    const res = await POST(
      postRequest({
        title: "Invalid priority task",
        priority: "CRITICAL",
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.db.task.create).not.toHaveBeenCalled();
  });

  it("rejects task creation without title", async () => {
    const res = await POST(postRequest({ priority: "HIGH" }));

    expect(res.status).toBe(400);
    expect(mocks.db.task.create).not.toHaveBeenCalled();
  });
});
