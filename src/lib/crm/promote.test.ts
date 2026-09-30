import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    account: { upsert: vi.fn() },
    deal: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    opportunity: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  loadCalibration: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/scoring/outcomes", () => ({ loadCalibration: mocks.loadCalibration }));

import { ensureDealForOpportunity, linkOpportunityForDeal, syncLinkedOpportunityStatus } from "./promote";
import { dealStatusFromOpportunity, opportunityStatusFromDeal } from "./status";

const opportunity = {
  id: "opp-1",
  ownerId: "owner-1",
  sourceId: "source-1",
  title: "AI automation for a Danish SME",
  description: "Build a reporting workflow.",
  rawContent: null,
  aiSummary: null,
  url: "https://example.dk/lead",
  organization: "Nordic Tools",
  workspace: "DK",
  category: "automation",
  budgetMin: 20000,
  budgetMax: 80000,
  currency: "DKK",
  deadline: new Date("2026-12-01T00:00:00.000Z"),
  status: "NEW",
  applicationRoute: "DIRECT",
  priority: 1,
  matchScore: 82,
  nextAction: null,
};

describe("status mapping", () => {
  it("maps new opportunities to discovered and keeps won and lost aligned", () => {
    expect(dealStatusFromOpportunity("NEW")).toBe("DISCOVERED");
    expect(dealStatusFromOpportunity("WATCH")).toBe("INTERESTING");
    expect(dealStatusFromOpportunity("APPLIED")).toBe("PROPOSAL");
    expect(dealStatusFromOpportunity("WON")).toBe("WON");
    expect(dealStatusFromOpportunity("LOST")).toBe("LOST");
    expect(opportunityStatusFromDeal("DISCOVERED")).toBe("NEW");
    expect(opportunityStatusFromDeal("QUALIFYING")).toBe("INTERESTING");
    expect(opportunityStatusFromDeal("NEGOTIATION")).toBe("APPLIED");
    expect(opportunityStatusFromDeal("WON")).toBe("WON");
    expect(opportunityStatusFromDeal("LOST")).toBe("LOST");
  });
});

describe("ensureDealForOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.account.upsert.mockResolvedValue({ id: "account-1" });
    mocks.db.deal.create.mockImplementation(async ({ data }) => ({ id: "deal-1", ...data }));
    mocks.db.deal.update.mockImplementation(async ({ data }) => ({ id: "deal-1", ...data }));
  });

  it("creates a discovered deal from a new opportunity", async () => {
    mocks.db.opportunity.findFirst.mockResolvedValue(opportunity);
    mocks.db.deal.findUnique.mockResolvedValue(null);

    const deal = await ensureDealForOpportunity("owner-1", "opp-1");

    expect(mocks.db.account.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId_name: { ownerId: "owner-1", name: "Nordic Tools" } },
      }),
    );
    expect(deal).toMatchObject({
      id: "deal-1",
      legacyOpportunityId: "opp-1",
      status: "DISCOVERED",
      title: opportunity.title,
      matchScore: 82,
      workspace: "DK",
    });
  });

  it("refreshes scores on an existing deal without resetting a user-moved status", async () => {
    mocks.db.opportunity.findFirst.mockResolvedValue({ ...opportunity, status: "WON" });
    mocks.db.deal.findUnique.mockResolvedValue({
      id: "deal-1",
      ownerId: "owner-1",
      status: "NEGOTIATION",
      url: "https://example.dk/lead",
      summary: "Kept by the user",
      nextAction: "Send proposal",
      deadline: null,
      valueMin: null,
      valueMax: null,
      currency: "DKK",
    });

    const deal = await ensureDealForOpportunity("owner-1", "opp-1");

    expect(mocks.db.deal.create).not.toHaveBeenCalled();
    expect(deal).toMatchObject({ summary: "Kept by the user", nextAction: "Send proposal" });
    expect(deal).not.toHaveProperty("status");
  });
});

describe("linkOpportunityForDeal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCalibration.mockResolvedValue(null);
    mocks.db.user.findUnique.mockResolvedValue({ scoringWeights: null, budgetMaxDkk: 100000 });
    mocks.db.opportunity.findUnique.mockResolvedValue(null);
    mocks.db.opportunity.create.mockResolvedValue({ id: "opp-new" });
    mocks.db.deal.update.mockImplementation(async ({ data }) => ({ id: "deal-9", ...data }));
  });

  it("creates a manual opportunity and stores the link", async () => {
    mocks.db.deal.findFirst.mockResolvedValue({
      id: "deal-9",
      ownerId: "owner-1",
      legacyOpportunityId: null,
      sourceId: null,
      title: "Manual consulting lead",
      summary: "A founder asked for an MVP.",
      rawContent: null,
      url: null,
      workspace: "GLOBAL",
      category: "MVP",
      valueMin: null,
      valueMax: 50000,
      currency: "DKK",
      deadline: null,
      status: "DISCOVERED",
      applicationRoute: "UNKNOWN",
      priority: 0,
      matchScore: null,
      nextAction: null,
      account: { name: "Acme" },
    });

    const deal = await linkOpportunityForDeal("owner-1", "deal-9");

    expect(mocks.db.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "owner-1",
          ingestMethod: "MANUAL",
          status: "NEW",
          organization: "Acme",
          workspace: "GLOBAL",
        }),
      }),
    );
    expect(deal).toMatchObject({ legacyOpportunityId: "opp-new" });
  });
});

describe("syncLinkedOpportunityStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the mapped opportunity status", async () => {
    mocks.db.deal.findFirst.mockResolvedValue({ legacyOpportunityId: "opp-1" });
    mocks.db.opportunity.updateMany.mockResolvedValue({ count: 1 });

    await syncLinkedOpportunityStatus("owner-1", "deal-1", "WON");

    expect(mocks.db.opportunity.updateMany).toHaveBeenCalledWith({
      where: { id: "opp-1", ownerId: "owner-1" },
      data: { status: "WON" },
    });
  });
});
