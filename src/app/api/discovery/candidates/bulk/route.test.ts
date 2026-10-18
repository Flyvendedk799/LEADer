import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  saveCandidateAsDeal: vi.fn(),
  db: {
    discoveryCandidate: {
      findMany: vi.fn(),
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
vi.mock("@/lib/crm", () => ({ saveCandidateAsDeal: mocks.saveCandidateAsDeal }));

import { POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/discovery/candidates/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/discovery/candidates/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerId.mockResolvedValue("owner-1");
  });

  it("processes save action and returns converted deals in results", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      { id: "cand-1" },
      { id: "cand-2" },
    ]);
    mocks.saveCandidateAsDeal.mockImplementation((_ownerId, id) => {
      if (id === "cand-1") {
        return Promise.resolve({ deal: { id: "deal-1" }, created: true });
      }
      return Promise.resolve({ deal: { id: "deal-2" }, created: false });
    });

    const res = await POST(
      postRequest({ ids: ["cand-1", "cand-2"], action: "save" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(2);
    expect(json.created).toBe(1);
    expect(json.existing).toBe(1);
    expect(json.missing).toBe(0);
    expect(json.results).toEqual([
      { id: "cand-1", dealId: "deal-1", created: true },
      { id: "cand-2", dealId: "deal-2", created: false },
    ]);
    expect(mocks.saveCandidateAsDeal).toHaveBeenCalledTimes(2);
    expect(mocks.saveCandidateAsDeal).toHaveBeenCalledWith("owner-1", "cand-1");
    expect(mocks.saveCandidateAsDeal).toHaveBeenCalledWith("owner-1", "cand-2");
  });

  it("processes dismiss action with status DISMISSED", async () => {
    mocks.db.discoveryCandidate.updateMany.mockResolvedValue({ count: 2 });

    const res = await POST(
      postRequest({
        ids: ["cand-1", "cand-2"],
        action: "dismiss",
        reason: "Not relevant",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, count: 2 });
    expect(mocks.db.discoveryCandidate.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        id: { in: ["cand-1", "cand-2"] },
      },
      data: {
        status: "DISMISSED",
        dismissalReason: "Not relevant",
      },
    });
  });

  it("returns 404 when no candidates match for dismiss", async () => {
    mocks.db.discoveryCandidate.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      postRequest({ ids: ["cand-999"], action: "dismiss" }),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("No matching candidates to update");
  });

  it("returns 404 when no candidates match for save", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([]);

    const res = await POST(
      postRequest({ ids: ["cand-999"], action: "save" }),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("No matching candidates to save");
  });

  it("rejects invalid payloads with 400", async () => {
    const res = await POST(postRequest({ ids: [], action: "save" }));
    expect(res.status).toBe(400);
  });
});
