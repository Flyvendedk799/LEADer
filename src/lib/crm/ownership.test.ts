import { beforeEach, describe, expect, it, vi } from "vitest";
const counts = vi.hoisted(() => ({
  deal: vi.fn(),
  account: vi.fn(),
  person: vi.fn(),
  source: vi.fn(),
  lane: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    deal: { count: counts.deal },
    account: { count: counts.account },
    person: { count: counts.person },
    source: { count: counts.source },
    discoveryLane: { count: counts.lane },
  },
}));
import { assertOwnedLinks } from "./ownership";
describe("CRM link authorization", () => {
  beforeEach(() => {
    Object.values(counts).forEach((fn) => fn.mockReset().mockResolvedValue(1));
  });
  it("rejects a foreign related record before any write", async () => {
    counts.account.mockResolvedValue(0);
    await expect(
      assertOwnedLinks("owner", { accountId: "foreign" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(counts.account).toHaveBeenCalledWith({
      where: { id: "foreign", ownerId: "owner" },
    });
  });
  it("validates every supplied relationship", async () => {
    await assertOwnedLinks("owner", {
      dealId: "deal",
      personId: "person",
      sourceId: "source",
      laneId: "lane",
    });
    expect(counts.deal).toHaveBeenCalled();
    expect(counts.person).toHaveBeenCalled();
    expect(counts.source).toHaveBeenCalled();
    expect(counts.lane).toHaveBeenCalled();
  });
});
