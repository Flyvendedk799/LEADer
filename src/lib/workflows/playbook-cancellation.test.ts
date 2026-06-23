import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    account: { findFirst: vi.fn() },
    person: { findFirst: vi.fn() },
    deal: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    discoveryCandidate: { findMany: vi.fn() },
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
  dispatchForOwner: vi.fn(),
  runDueDiscovery: vi.fn(),
  saveCandidateAsDeal: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/alerts/dispatch", () => ({ dispatchForOwner: mocks.dispatchForOwner }));
vi.mock("@/lib/ingestion", () => ({ runDueDiscovery: mocks.runDueDiscovery }));
vi.mock("@/lib/crm", () => ({ saveCandidateAsDeal: mocks.saveCandidateAsDeal }));

import { runResearchBrief, WorkflowRunCanceledError } from "./playbooks";

describe("workflow playbook cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops a research brief before creating tasks when the run was canceled", async () => {
    const isCanceled = vi.fn().mockResolvedValue(true);

    await expect(
      runResearchBrief(
        "owner-1",
        "DK",
        {
          subject: "Mette Jensen",
          subjectType: "person",
          objective: "find-contact",
          depth: "standard",
          createTasks: true,
        },
        { isCanceled },
      ),
    ).rejects.toBeInstanceOf(WorkflowRunCanceledError);

    expect(isCanceled).toHaveBeenCalled();
    expect(mocks.db.task.findMany).not.toHaveBeenCalled();
    expect(mocks.db.task.create).not.toHaveBeenCalled();
  });
});
