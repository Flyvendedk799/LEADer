import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeWorkflowRun: vi.fn(),
  db: {
    workflowRun: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("./playbooks", () => ({ executeWorkflowRun: mocks.executeWorkflowRun }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/background", () => ({ keepAlive: vi.fn() }));

import { drainQueuedWorkflowRuns } from "./queue";

describe("drainQueuedWorkflowRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeWorkflowRun.mockResolvedValue(undefined);
    mocks.db.workflowRun.update.mockResolvedValue({});
  });

  it("awaits a queued run loaded from the database", async () => {
    mocks.db.workflowRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        input: { playbook: "daily-sweep", workspace: "DK", options: {} },
      },
    ]);

    await expect(drainQueuedWorkflowRuns("owner-1", 3)).resolves.toEqual(["run-1"]);
    expect(mocks.executeWorkflowRun).toHaveBeenCalledWith(
      "owner-1",
      "run-1",
      expect.objectContaining({ playbook: "daily-sweep" }),
    );
  });
});
