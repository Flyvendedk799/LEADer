import { test, expect } from "@playwright/test";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

test("a run with no usable provider fails clearly and keeps its history", async ({
  request,
}) => {
  const lanesResponse = await request.get("/api/discovery/lanes");
  const lanesData = await lanesResponse.json();
  const lane = (Array.isArray(lanesData) ? lanesData : lanesData.lanes).find(
    (item: { slug: string }) => item.slug === "direct-startup-mvp",
  );
  const response = await request.post("/api/discovery/runs", {
    data: {
      laneId: lane.id,
      workspace: "GLOBAL",
      query: "E2E missing provider",
      useAiPlanner: false,
      includeWeb: true,
      includeSources: false,
      provider: "none",
      maxResults: 4,
    },
  });
  expect(response.ok()).toBe(true);
  const { mission } = await response.json();
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/discovery/runs/${mission.id}`)).json())
          .mission.status,
      { timeout: 15000 },
    )
    .toBe("ERROR");
  const saved = await (
    await request.get(`/api/discovery/runs/${mission.id}`)
  ).json();
  expect(saved.mission.warnings.join(" ")).toContain("No searchable source");
  expect(saved.mission.candidates).toHaveLength(0);
});

test("reviewed discoveries become persistent deals", async ({
  page,
  request,
}) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const title = `E2E review ${Date.now()}`;
  const candidate = await db.discoveryCandidate.create({
    data: {
      ownerId: user.id,
      title,
      description: "A funded software assignment ready to qualify.",
      organization: "E2E Review Account",
      pursuitScore: 85,
      workspace: "DK",
      url: `https://example.com/test-project/${Date.now()}`,
    },
  });
  try {
    await page.goto(`/inbox?candidate=${candidate.id}&workspace=DK`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add to deals", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).not.toBeVisible();
    await page.goto(`/deals?workspace=DK&q=${encodeURIComponent(title)}`);
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("concurrent saves create one deal and preserve evidence and follow-up", async ({
  request,
}) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const title = `E2E atomic save ${Date.now()}`;
  const candidate = await db.discoveryCandidate.create({
    data: {
      ownerId: user.id,
      title,
      workspace: "GLOBAL",
      url: `https://example.com/atomic/${Date.now()}`,
      evidence: {
        create: {
          ownerId: user.id,
          kind: "WEB_RESULT",
          snippet: "Original source evidence",
          metadata: { provenance: { status: "read" } },
        },
      },
    },
  });
  try {
    const responses = await Promise.all(
      [1, 2].map(() =>
        request.patch(`/api/discovery/candidates/${candidate.id}`, {
          data: { action: "save" },
        }),
      ),
    );
    expect(responses.map((response) => response.status()).sort()).toEqual([
      200, 201,
    ]);
    const deals = await db.deal.findMany({
      where: { ownerId: user.id, title },
      include: { evidence: true, tasks: true },
    });
    expect(deals).toHaveLength(1);
    expect(deals[0].workspace).toBe("GLOBAL");
    expect(deals[0].evidence[0].snippet).toBe("Original source evidence");
    expect(deals[0].tasks).toHaveLength(1);
    expect(deals[0].tasks[0].dueAt).not.toBeNull();
  } finally {
    await db.$disconnect();
  }
});

test("deal creation, editing, filtering and board stage changes persist", async ({
  page,
}) => {
  const title = `E2E project ${Date.now()}`;
  await page.goto("/deals?workspace=DK&new=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog
    .getByLabel("Summary", { exact: true })
    .fill("Build a useful reporting tool.");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: "Edit deal" }).click();
  await dialog
    .getByLabel("Next action", { exact: true })
    .fill("Send project outline");
  await dialog.getByLabel("Maximum value").fill("42000");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Send project outline", { exact: true }),
  ).toBeVisible();
  await page.goto(`/deals?workspace=DK&q=${encodeURIComponent(title)}`);
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto("/board?workspace=DK");
  await page
    .getByLabel(`Stage for ${title}`, { exact: true })
    .selectOption("WON");
  await expect(
    page.getByRole("status").filter({ hasText: "Status updated" }),
  ).toBeVisible();
  await page.goto(url);
  await expect(
    page.getByRole("combobox", { name: "Deal status" }),
  ).toContainText("Won");
  await page.goto(
    `/deals?workspace=DK&status=WON&q=${encodeURIComponent(title)}`,
  );
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
});

test("personal follow-ups can be created, completed and reopened", async ({
  page,
}) => {
  const title = `E2E follow-up ${Date.now()}`;
  await page.goto("/tasks");
  await page.getByLabel("Task title", { exact: true }).fill(title);
  await page.getByLabel("Due date", { exact: true }).fill("2026-10-05");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Complete ${title}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Complete ${title}`, exact: true })
    .click();
  await page.getByRole("link", { name: "Completed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Reopen ${title}`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: `Reopen ${title}`, exact: true })
    .click();
  await page.getByRole("link", { name: "Open tasks", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Complete ${title}`, exact: true }),
  ).toBeVisible();
});

test("workspace follows navigation and mobile pages do not overflow", async ({
  page,
}) => {
  await page.goto("/?workspace=GLOBAL");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Deals", exact: true })
    .click();
  await expect(page).toHaveURL(/workspace=GLOBAL/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/tasks",
    "/deals",
    "/discover",
    "/inbox",
    "/accounts",
    "/workflows",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `${path} should fit a phone screen`).toBe(false);
  }
});

test("invalid filters and foreign relation IDs produce controlled responses", async ({
  request,
}) => {
  expect(
    (
      await request.get("/api/deals?page=NaN&pageSize=Infinity&status=INVALID")
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/tasks?status=INVALID")).status()).toBe(400);
  expect(
    (
      await request.post("/api/tasks", {
        data: { title: "Invalid relationship", dealId: "not-owned" },
      })
    ).status(),
  ).toBe(404);
});
