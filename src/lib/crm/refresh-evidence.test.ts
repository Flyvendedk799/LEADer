import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  db: { $queryRaw: vi.fn(), $transaction: vi.fn(), deal: { findMany: vi.fn(), update: vi.fn() }, evidence: { findUnique: vi.fn(), upsert: vi.fn() }, task: { upsert: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/discovery", () => ({ fetchReadablePage: mocks.read }));
import { refreshDealEvidence } from "./refresh-evidence";
describe("saved source rechecks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$queryRaw.mockResolvedValue([{ id: "deal" }]);
    mocks.db.deal.findMany.mockResolvedValue([{ id: "deal", accountId: null, url: "https://example.com/brief", deadline: new Date("2099-11-01") }]);
    mocks.db.evidence.findUnique.mockResolvedValue(null);
    mocks.db.$transaction.mockImplementation(async fn => fn(mocks.db));
  });
  it("retains changed deadline evidence and requests review without overwriting owner fields", async () => {
    mocks.read.mockResolvedValue({ text: "Project brief. Deadline: 2099-12-20", provenance: { status: "read", retrievedAt: "2026-11-17" } });
    expect(await refreshDealEvidence("owner", "DK")).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(mocks.db.task.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ ownerId: "owner", dealId: "deal", priority: "HIGH" }) }));
    expect(mocks.db.deal.update).not.toHaveBeenCalled();
  });
  it("does not reread the same day's evidence and respects cancellation", async () => {
    mocks.db.evidence.findUnique.mockResolvedValue({ id: "existing" });
    await refreshDealEvidence("owner", "DK");
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.db.evidence.findUnique.mockResolvedValue(null);
    await refreshDealEvidence("owner", "DK", async () => true);
    expect(mocks.db.evidence.upsert).not.toHaveBeenCalled();
  });
});
