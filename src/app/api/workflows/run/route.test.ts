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

import { PATCH } from "./route";

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
