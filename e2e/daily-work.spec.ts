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

test("bulk actions only process leads matching active filters (select-then-filter-then-action)", async ({
  page,
  request,
}) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const idPrefix = Date.now();
  const titleA = `E2E SelectFilter Alpha ${idPrefix}`;
  const titleB = `E2E SelectFilter Beta ${idPrefix}`;

  const [candA, candB] = await Promise.all([
    db.discoveryCandidate.create({
      data: {
        ownerId: user.id,
        title: titleA,
        description: "Alpha lead description for filtering",
        organization: "Alpha Corp",
        pursuitScore: 88,
        workspace: "DK",
        url: `https://example.com/alpha-${idPrefix}`,
      },
    }),
    db.discoveryCandidate.create({
      data: {
        ownerId: user.id,
        title: titleB,
        description: "Beta lead description for filtering",
        organization: "Beta Corp",
        pursuitScore: 75,
        workspace: "DK",
        url: `https://example.com/beta-${idPrefix}`,
      },
    }),
  ]);

  try {
    await page.goto("/inbox?workspace=DK");
    await expect(
      page.getByRole("heading", { name: titleA, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: titleB, exact: true }),
    ).toBeVisible();

    // Select candidate A and B
    await page.getByRole("checkbox", { name: `Select ${titleA}` }).click();
    await page.getByRole("checkbox", { name: `Select ${titleB}` }).click();

    const bulkToolbar = page.getByRole("complementary", {
      name: "Bulk actions",
    });
    await expect(bulkToolbar).toBeVisible();
    await expect(bulkToolbar).toContainText("2 selected");

    // Filter to only "Alpha"
    await page.getByLabel("Search leads").fill("Alpha");
    await expect(
      page.getByRole("heading", { name: titleA, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: titleB, exact: true }),
    ).not.toBeVisible();

    // The bulk toolbar should now display "1 selected"
    await expect(bulkToolbar).toContainText("1 selected");

    // Trigger bulk "Add to deals"
    await bulkToolbar.getByRole("button", { name: "Add to deals" }).click();

    // Candidate A should be removed from view
    await expect(
      page.getByRole("heading", { name: titleA, exact: true }),
    ).not.toBeVisible();

    // Reset filters
    await page.getByRole("button", { name: "Reset", exact: true }).click();

    // Candidate B was NOT in active filter selection during the bulk action, so it remains in inbox
    await expect(
      page.getByRole("heading", { name: titleB, exact: true }),
    ).toBeVisible();

    // Verify in database: candA is SAVED as deal, candB is still NEW
    const updatedA = await db.discoveryCandidate.findUnique({
      where: { id: candA.id },
    });
    const updatedB = await db.discoveryCandidate.findUnique({
      where: { id: candB.id },
    });
    expect(updatedA?.status).toBe("SAVED");
    expect(updatedB?.status).toBe("NEW");

    // Check deal created for titleA and none for titleB
    const dealA = await db.deal.findFirst({
      where: { ownerId: user.id, title: titleA },
    });
    const dealB = await db.deal.findFirst({
      where: { ownerId: user.id, title: titleB },
    });
    expect(dealA).not.toBeNull();
    expect(dealB).toBeNull();
  } finally {
    await db.deal.deleteMany({
      where: { ownerId: user.id, title: { in: [titleA, titleB] } },
    });
    await db.discoveryCandidate.deleteMany({
      where: { id: { in: [candA.id, candB.id] } },
    });
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

test("stepper and combobox stay synchronized and rollback on failure", async ({
  page,
  request,
}) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const title = `E2E Stepper Deal ${Date.now()}`;
  const deal = await db.deal.create({
    data: {
      ownerId: user.id,
      title,
      status: "QUALIFYING",
      workspace: "DK",
      valueMin: 15000,
      valueMax: 25000,
      currency: "DKK",
    },
  });

  try {
    await page.goto(`/deals/${deal.id}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();

    // Verify initial stepper state: Qualifying is active step
    const qualifyingStep = page.getByRole("button", {
      name: "Set status to Qualifying",
    });
    await expect(qualifyingStep).toHaveAttribute("aria-current", "step");

    const statusCombobox = page.getByRole("combobox", { name: "Deal status" });
    await expect(statusCombobox).toContainText("Qualifying");

    // Click Contacted on the stepper
    await page.getByRole("button", { name: "Set status to Contacted" }).click();
    await expect(
      page.getByRole("button", { name: "Set status to Contacted" }),
    ).toHaveAttribute("aria-current", "step");
    await expect(statusCombobox).toContainText("Contacted");

    // Change status using the combobox to Proposal
    await statusCombobox.click();
    await page.getByRole("option", { name: "Proposal" }).click();
    await expect(
      page.getByRole("button", { name: "Set status to Proposal" }),
    ).toHaveAttribute("aria-current", "step");
    await expect(statusCombobox).toContainText("Proposal");

    // Intercept API to simulate failure and verify rollback
    await page.route(`**/api/deals/${deal.id}`, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Server update failed" }),
      }),
    );

    // Attempt moving to Negotiation
    await page
      .getByRole("button", { name: "Set status to Negotiation" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Couldn't update status" }),
    ).toBeVisible();

    // Verify rollback to Proposal in both stepper and combobox
    await expect(
      page.getByRole("button", { name: "Set status to Proposal" }),
    ).toHaveAttribute("aria-current", "step");
    await expect(statusCombobox).toContainText("Proposal");

    await page.unroute(`**/api/deals/${deal.id}`);
  } finally {
    await db.deal.deleteMany({ where: { id: deal.id } });
    await db.$disconnect();
  }
});

test("inline deal task creation links dealId and accountId with quick dates and priority", async ({
  page,
  request,
}) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const accountName = `E2E Account ${Date.now()}`;
  const dealTitle = `E2E Linked Task Deal ${Date.now()}`;

  const account = await db.account.create({
    data: {
      ownerId: user.id,
      name: accountName,
      workspace: "DK",
    },
  });

  const deal = await db.deal.create({
    data: {
      ownerId: user.id,
      accountId: account.id,
      title: dealTitle,
      workspace: "DK",
      status: "QUALIFYING",
    },
  });

  const taskTitle = `E2E Inline Follow-up ${Date.now()}`;

  try {
    await page.goto(`/deals/${deal.id}`);
    await expect(
      page.getByRole("heading", { name: dealTitle, exact: true }),
    ).toBeVisible();

    // Fill inline task form in deal actions
    await page.getByLabel("Follow-up task title").fill(taskTitle);
    await page.getByLabel("Task priority").selectOption("HIGH");

    // Click quick date "Tomorrow"
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    const dateInput = page.getByLabel("Task due date");
    const dateVal = await dateInput.inputValue();
    expect(dateVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Save task
    await page.getByRole("button", { name: "Save task", exact: true }).click();

    // Verify task is visible under Follow-ups & tasks on the page
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();

    // Verify in database that dealId, accountId, and priority are correctly linked
    const createdTask = await db.task.findFirst({
      where: { ownerId: user.id, title: taskTitle },
    });
    expect(createdTask).not.toBeNull();
    expect(createdTask?.dealId).toBe(deal.id);
    expect(createdTask?.accountId).toBe(account.id);
    expect(createdTask?.priority).toBe("HIGH");
    expect(createdTask?.dueAt).not.toBeNull();
  } finally {
    await db.task.deleteMany({
      where: { ownerId: user.id, title: taskTitle },
    });
    await db.deal.deleteMany({ where: { id: deal.id } });
    await db.account.deleteMany({ where: { id: account.id } });
    await db.$disconnect();
  }
});

test("deal table column header sorting retains filters, resets page, and applies aria-sort", async ({
  page,
  request,
}) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const uniqueTag = `SortTag${Date.now()}`;
  const title1 = `E2E Sort Deal 1 ${uniqueTag}`;
  const title2 = `E2E Sort Deal 2 ${uniqueTag}`;

  await db.deal.createMany({
    data: [
      {
        ownerId: user.id,
        title: title1,
        workspace: "DK",
        status: "QUALIFYING",
        valueMin: 10000,
        valueMax: 20000,
        pursuitScore: 90,
        deadline: new Date("2026-12-01"),
      },
      {
        ownerId: user.id,
        title: title2,
        workspace: "DK",
        status: "QUALIFYING",
        valueMin: 50000,
        valueMax: 80000,
        pursuitScore: 60,
        deadline: new Date("2026-11-01"),
      },
    ],
  });

  try {
    // Navigate with existing filter q, pageSize=1, and page=2 so page 2 has a row and header
    await page.goto(
      `/deals?workspace=DK&q=${encodeURIComponent(uniqueTag)}&pageSize=1&page=2`,
    );

    // Sort by Deadline
    await page.getByRole("link", { name: "Sort by Deadline" }).click();

    // Check URL retains workspace=DK, q, pageSize=1, resets page, and adds sort=deadline
    await expect(page).toHaveURL(/workspace=DK/);
    await expect(page).toHaveURL(
      new RegExp(`q=${encodeURIComponent(uniqueTag)}`),
    );
    await expect(page).toHaveURL(/pageSize=1/);
    await expect(page).toHaveURL(/sort=deadline/);
    expect(page.url()).not.toContain("page=");

    // Deadline sort is ascending: header has aria-sort="ascending"
    const deadlineHeader = page.locator("th[aria-sort='ascending']");
    await expect(deadlineHeader).toContainText("Deadline");

    // Sort by Value
    await page.getByRole("link", { name: "Sort by Value" }).click();
    await expect(page).toHaveURL(/workspace=DK/);
    await expect(page).toHaveURL(
      new RegExp(`q=${encodeURIComponent(uniqueTag)}`),
    );
    await expect(page).toHaveURL(/pageSize=1/);
    await expect(page).toHaveURL(/sort=value/);
    expect(page.url()).not.toContain("page=");

    // Value sort is descending: header has aria-sort="descending"
    const valueHeader = page.locator("th[aria-sort='descending']");
    await expect(valueHeader).toContainText("Value");
  } finally {
    await db.deal.deleteMany({
      where: { ownerId: user.id, title: { in: [title1, title2] } },
    });
    await db.$disconnect();
  }
});

test("pipeline board computes per-currency pipeline totals and updates live on stage move", async ({
  page,
  request,
}) => {
  const db = new PrismaClient();
  const { user } = await (await request.get("/api/auth/me")).json();
  const idPrefix = Date.now();
  const dkkTitle = `E2E DKK Deal ${idPrefix}`;
  const eurTitle = `E2E EUR Deal ${idPrefix}`;

  const [dealDKK, dealEUR] = await Promise.all([
    db.deal.create({
      data: {
        ownerId: user.id,
        title: dkkTitle,
        workspace: "DK",
        status: "QUALIFYING",
        valueMin: 60000,
        valueMax: 60000,
        currency: "DKK",
      },
    }),
    db.deal.create({
      data: {
        ownerId: user.id,
        title: eurTitle,
        workspace: "DK",
        status: "QUALIFYING",
        valueMin: 25000,
        valueMax: 25000,
        currency: "EUR",
      },
    }),
  ]);

  try {
    await page.goto("/board?workspace=DK");

    // Check board currency totals region displays formatted amounts
    const boardTotals = page.getByRole("region", {
      name: "Board currency totals",
    });
    await expect(boardTotals).toBeVisible();
    await expect(boardTotals).toContainText(/25\.000\s*EUR/);

    // Check Qualifying column totals initially has 25.000 EUR
    const qualifyingTotals = page.getByLabel("Qualifying value totals");
    await expect(qualifyingTotals).toContainText(/25\.000\s*EUR/);

    // Proposal column before move shouldn't have 25.000 EUR (handles absent or empty element)
    await expect(
      page
        .getByLabel("Proposal value totals")
        .filter({ hasText: /25\.000\s*EUR/ }),
    ).toHaveCount(0);

    // Move the EUR deal from Qualifying to Proposal using stage select
    await page
      .getByLabel(`Stage for ${eurTitle}`, { exact: true })
      .selectOption("PROPOSAL");
    await expect(
      page.getByRole("status").filter({ hasText: "Status updated" }),
    ).toBeVisible();

    // After move, Qualifying column no longer contains 25.000 EUR, but Proposal does
    await expect(
      page
        .getByLabel("Qualifying value totals")
        .filter({ hasText: /25\.000\s*EUR/ }),
    ).toHaveCount(0);
    const proposalTotals = page.getByLabel("Proposal value totals");
    await expect(proposalTotals).toContainText(/25\.000\s*EUR/);
  } finally {
    await db.deal.deleteMany({
      where: { id: { in: [dealDKK.id, dealEUR.id] } },
    });
    await db.$disconnect();
  }
});
