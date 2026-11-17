import { test, expect } from "@playwright/test";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

test("import, review, snooze, accept and record external outreach without duplicate follow-ups", async ({ page, request }) => {
  const title = `Acquisition portal ${Date.now()}`;
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  try {
    const operations = await request.get("/api/operations");
    expect(operations.ok()).toBe(true);
    expect((await operations.json()).worker.ready).toBe(true);
    const settings = await (await request.get("/api/settings")).json();
    expect(settings).not.toHaveProperty("passwordHash");
    await page.goto("/import");
    await page.getByLabel("Lead content", { exact: true }).fill(`${title}\nCompany needs a paid software portal.\nhttps://example.com/acquisition/${Date.now()}`);
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await expect(page.getByRole("cell", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "Add 1 rows to review" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 leads added or matched" })).toBeVisible();
    const candidate = await db.discoveryCandidate.findFirstOrThrow({ where: { ownerId: user.id, title } });
    expect(await db.deal.count({ where: { ownerId: user.id, title } })).toBe(0);
    await page.goto(`/inbox?candidate=${candidate.id}`);
    await page.getByRole("button", { name: "Snooze 7 days" }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Undo last dismissal / snooze" }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page.getByText("Correct extracted facts", { exact: true }).click();
    await page.getByLabel("Buyer", { exact: true }).fill("Owner verified buyer");
    await page.getByRole("button", { name: "Save corrections", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Corrections saved" })).toBeVisible();
    expect(await db.evidence.count({ where: { candidateId: candidate.id, kind: "USER_NOTE" } })).toBe(1);
    await page.getByRole("button", { name: "Add to deals", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    const deal = await db.deal.findFirstOrThrow({ where: { ownerId: user.id, title } });
    await page.goto(`/deals/${deal.id}`);
    await page.getByLabel("Message or proposal summary").fill("Sent an introduction externally.");
    await page.getByRole("button", { name: "Mark contacted", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Recorded with a follow-up task" })).toBeVisible();
    expect(await db.task.count({ where: { ownerId: user.id, dealId: deal.id, title: "Follow up on outreach" } })).toBe(1);
    expect(await db.touchpoint.count({ where: { ownerId: user.id, dealId: deal.id, outcome: "CONTACTED" } })).toBe(1);
    const asset = await db.conversionAsset.create({ data: { ownerId: user.id, dealId: deal.id, kind: "OUTREACH", content: "Original draft" } });
    const version = await request.post(`/api/conversion-assets/${asset.id}/versions`, { data: { content: "Edited draft" } });
    expect(version.ok()).toBe(true);
    expect((await db.conversionAsset.findUniqueOrThrow({ where: { id: asset.id } })).content).toBe("Original draft");
  } finally {
    const deals = await db.deal.findMany({ where: { ownerId: user.id, title }, select: { id: true, legacyOpportunityId: true } });
    const ids = deals.map(d => d.id);
    await db.task.deleteMany({ where: { dealId: { in: ids } } });
    await db.touchpoint.deleteMany({ where: { dealId: { in: ids } } });
    await db.conversionAsset.deleteMany({ where: { dealId: { in: ids } } });
    await db.deal.deleteMany({ where: { id: { in: ids } } });
    await db.discoveryCandidate.deleteMany({ where: { ownerId: user.id, title } });
    await db.opportunity.deleteMany({ where: { id: { in: deals.flatMap(d => d.legacyOpportunityId ? [d.legacyOpportunityId] : []) } } });
    await db.$disconnect();
  }
});


test("usage reconciliation and evaluation export are owner-scoped", async ({ request }) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const other = await db.user.create({ data: { email: `ledger-${Date.now()}@example.invalid` } });
  const own = await db.providerUsage.create({ data: { ownerId: user.id, kind: "SEARCH", units: 1, reservedUsd: .02 } });
  const foreign = await db.providerUsage.create({ data: { ownerId: other.id, kind: "SEARCH", units: 1, reservedUsd: .02 } });
  try {
    expect((await request.patch("/api/usage", { data: { id: foreign.id, actualUsd: .04, invoiceReference: "Other owner" } })).status()).toBe(404);
    expect((await request.patch("/api/usage", { data: { id: own.id, actualUsd: .04, invoiceReference: "E2E invoice" } })).ok()).toBe(true);
    const rows = await (await request.get("/api/usage")).json();
    expect(rows.some((row: { id: string }) => row.id === foreign.id)).toBe(false);
    expect((await db.providerUsage.findUniqueOrThrow({ where: { id: own.id } })).actualUsd?.toString()).toBe("0.04");
    const evaluation = await request.get("/api/discovery/evaluation");
    expect(evaluation.ok()).toBe(true);
    expect((await evaluation.json()).records).toBeInstanceOf(Array);
  } finally {
    await db.providerUsage.delete({ where: { id: own.id } });
    await db.user.delete({ where: { id: other.id } });
    await db.$disconnect();
  }
});
