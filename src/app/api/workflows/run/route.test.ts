import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  createWorkflowRun: vi.fn(),
  db: {
    workflowRun: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workflowPreset: {
      findFirst: vi.fn(),
    },
  },
  recoverWorkflowQueue: vi.fn(),
  visibleWorkflowQueueSnapshotForOwner: vi.fn(),
  workflowQueueSnapshot: vi.fn(),
  enqueueWorkflowRun: vi.fn(),
  isActiveWorkflowRun: vi.fn(),
  removeQueuedWorkflowRun: vi.fn(),
  reorderQueuedWorkflowRun: vi.fn(),
  findActiveResearchBriefRun: vi.fn(),
  researchBriefIdentityFromInput: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwnerId: mocks.requireOwnerId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/workflows/playbooks", () => ({ createWorkflowRun: mocks.createWorkflowRun }));
vi.mock("@/lib/workflows/queue", () => ({
  enqueueWorkflowRun: mocks.enqueueWorkflowRun,
  isActiveWorkflowRun: mocks.isActiveWorkflowRun,
  recoverWorkflowQueue: mocks.recoverWorkflowQueue,
  removeQueuedWorkflowRun: mocks.removeQueuedWorkflowRun,
  reorderQueuedWorkflowRun: mocks.reorderQueuedWorkflowRun,
  visibleWorkflowQueueSnapshotForOwner: mocks.visibleWorkflowQueueSnapshotForOwner,
  workflowQueueSnapshot: mocks.workflowQueueSnapshot,
}));
vi.mock("@/lib/workflows/preset-runs", () => ({ ACTIVE_WORKFLOW_RUN_STATUSES: ["QUEUED", "RUNNING"] }));
vi.mock("@/lib/workflows/research-targets", () => ({
  findActiveResearchBriefRun: mocks.findActiveResearchBriefRun,
  researchBriefIdentityFromInput: mocks.researchBriefIdentityFromInput,
}));

import { GET, PATCH } from "./route";

function getRequest(query = "") {
  return new Request(`http://localhost/api/workflows/run${query}`);
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/workflows/run", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("workflow run API controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerId.mockResolvedValue("owner-1");
    mocks.recoverWorkflowQueue.mockResolvedValue({ activeRunId: null, queuedRunIds: [] });
  });

  it("loads expanded workflow run history when requested", async () => {
    mocks.db.workflowRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        playbook: "research-brief",
        workspace: "DK",
        status: "SUCCESS",
        result: { subject: "Mette Jensen", createdTasks: 2 },
        preset: { name: "Contact research" },
      },
    ]);

    const response = await GET(getRequest("?limit=80"));

    expect(response.status).toBe(200);
    expect(mocks.db.workflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1" },
        take: 80,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      runs: [
        expect.objectContaining({
          id: "run-1",
          presetName: "Contact research",
          summary: expect.any(String),
        }),
      ],
      queue: { activeRunId: null, queuedRunIds: [] },
    });
  });

  it("caps expanded workflow run history requests", async () => {
    mocks.db.workflowRun.findMany.mockResolvedValue([]);

    await GET(getRequest("?limit=500"));

    expect(mocks.db.workflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      }),
    );
  });

  it("preserves expanded workflow history after canceling live runs", async () => {
    mocks.db.workflowRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.visibleWorkflowQueueSnapshotForOwner.mockResolvedValue({ activeRunId: null, queuedRunIds: [] });

    const response = await PATCH(patchRequest({ action: "CANCEL_ALL", limit: 80 }));

    expect(response.status).toBe(200);
    expect(mocks.db.workflowRun.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { ownerId: "owner-1" },
        take: 80,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      runs: [],
      queue: { activeRunId: null, queuedRunIds: [] },
      canceled: 0,
    });
  });

  it("blocks rerunning a live workflow run", async () => {
    mocks.db.workflowRun.findFirst.mockResolvedValue({
      id: "run-1",
      ownerId: "owner-1",
      playbook: "daily-sweep",
      workspace: "DK",
      status: "RUNNING",
      input: { playbook: "daily-sweep", workspace: "DK" },
      presetId: null,
    });

    const response = await PATCH(patchRequest({ id: "run-1", action: "RERUN" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Wait for this workflow run to finish before rerunning it.",
    });
    expect(mocks.createWorkflowRun).not.toHaveBeenCalled();
    expect(mocks.enqueueWorkflowRun).not.toHaveBeenCalled();
  });
});
