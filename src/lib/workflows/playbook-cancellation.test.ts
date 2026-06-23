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
    discoveryCandidate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
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

  it("carries discovery candidate context into linked research tasks", async () => {
    mocks.db.account.findFirst.mockResolvedValue(null);
    mocks.db.person.findFirst.mockResolvedValue(null);
    mocks.db.deal.findFirst.mockResolvedValue(null);
    mocks.db.discoveryCandidate.findFirst.mockResolvedValue({
      id: "candidate-1",
      title: "Intranet",
      organization: "Metroselskabet I/S",
      sourceName: "udbud.dk",
      url: "https://udbud.dk/detaljevisning?noticeId=123",
      rawContent: "Ordregiver: Metroselskabet. CPV: 72000000.",
      description: "Aktivt udbud om intranet.",
      accountId: null,
      dealId: null,
      evidence: [
        {
          title: "Udbud.dk notice",
          snippet: "Tilbudsfrist og ordregiver fremgår af bekendtgørelsen.",
          url: "https://udbud.dk/detaljevisning?noticeId=123",
        },
      ],
    });
    mocks.db.task.findMany.mockResolvedValue([]);
    mocks.db.task.create.mockResolvedValue({ id: "task-1" });

    const result = await runResearchBrief("owner-1", "DK", {
      subject: "Metroselskabet I/S",
      subjectType: "company",
      objective: "find-contact",
      depth: "quick",
      candidateId: "candidate-1",
      createTasks: true,
    });

    expect(result.linked).toMatchObject({
      candidateId: "candidate-1",
      candidateTitle: "Intranet",
      candidateUrl: "https://udbud.dk/detaljevisning?noticeId=123",
    });
    expect(mocks.db.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: expect.stringContaining("Linked discovery context:"),
        }),
      }),
    );
    expect(mocks.db.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: expect.stringContaining("Tilbudsfrist og ordregiver"),
        }),
      }),
    );
  });
});
