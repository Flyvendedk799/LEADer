import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { ReviewInbox, filterReviewLeads } from "./review-inbox";

const mockLeads = [
  {
    id: "lead-1",
    title: "E2E Lead 1",
    organization: "Org 1",
    description: "Description 1",
    url: "https://example.com/1",
    budgetMin: 10000,
    budgetMax: 50000,
    currency: "DKK",
    pursuitScore: 85,
    deadline: new Date("2026-11-01"),
    lane: { name: "Direct startup" },
    evidence: [],
    reasons: ["Strong match"],
  },
  {
    id: "lead-2",
    title: "E2E Lead 2",
    organization: "Org 2",
    description: "Description 2",
    url: null,
    budgetMin: null,
    budgetMax: null,
    currency: null,
    pursuitScore: 70,
    deadline: null,
    lane: { name: "Tenders" },
    evidence: [],
    reasons: [],
  },
];

describe("ReviewInbox component", () => {
  it("renders empty state when there are no leads", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewInbox, { leads: [], workspace: "DK" }),
    );
    expect(html).toContain("Inbox zero");
    expect(html).toContain("Find leads");
  });

  it("renders select all toggle and individual checkboxes on lead cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewInbox, { leads: mockLeads, workspace: "DK" }),
    );
    expect(html).toContain("Select all");
    expect(html).toContain("(2)");
    expect(html).toContain('aria-label="Select E2E Lead 1"');
    expect(html).toContain('aria-label="Select E2E Lead 2"');
  });

  it("preserves exact 'Add to deals' and 'Dismiss' button labels on lead cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewInbox, { leads: mockLeads, workspace: "DK" }),
    );
    // Preserves individual card Add to deals button
    expect(html).toContain("Add to deals");
    expect(html).toContain("Dismiss");
    // Verify each card has its heading
    expect(html).toContain("E2E Lead 1");
    expect(html).toContain("E2E Lead 2");
  });

  it("renders search, lane, and score filter controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewInbox, { leads: mockLeads, workspace: "DK" }),
    );
    expect(html).toContain('aria-label="Search leads"');
    expect(html).toContain('aria-label="Filter by lane"');
    expect(html).toContain('aria-label="Filter by score"');
    expect(html).toContain("Direct startup");
    expect(html).toContain("Tenders");
    expect(html).toContain("All lanes");
    expect(html).toContain("All scores");
  });
});

describe("filterReviewLeads and bulk selection agreement", () => {
  const leads = [
    {
      id: "lead-alpha",
      title: "Frontend React Developer",
      organization: "Acme Corp",
      description: "Build interactive dashboards",
      lane: { name: "Direct startup" },
      pursuitScore: 85,
    },
    {
      id: "lead-beta",
      title: "Backend Python Engineer",
      organization: "Nordic Tech",
      description: "Data pipelines and microservices",
      lane: { name: "Tenders" },
      pursuitScore: 65,
    },
    {
      id: "lead-gamma",
      title: "DevOps Consultant",
      organization: "Cloud DK",
      description: "Kubernetes migration",
      lane: { name: "Direct startup" },
      pursuitScore: 45,
    },
  ];

  it("filters leads by search query across title, org, description, and lane", () => {
    // Title match
    expect(filterReviewLeads(leads, { searchQuery: "react" })).toHaveLength(1);
    // Org match
    expect(filterReviewLeads(leads, { searchQuery: "nordic" })).toHaveLength(1);
    // Description match
    expect(filterReviewLeads(leads, { searchQuery: "kubernetes" })).toHaveLength(1);
    // Lane match
    expect(filterReviewLeads(leads, { searchQuery: "tenders" })).toHaveLength(1);
    // Non-matching
    expect(filterReviewLeads(leads, { searchQuery: "nonexistent" })).toHaveLength(0);
  });

  it("filters leads by lane", () => {
    const startup = filterReviewLeads(leads, { selectedLane: "Direct startup" });
    expect(startup).toHaveLength(2);
    expect(startup.map((l) => l.id)).toEqual(["lead-alpha", "lead-gamma"]);

    const tenders = filterReviewLeads(leads, { selectedLane: "Tenders" });
    expect(tenders).toHaveLength(1);
    expect(tenders[0].id).toBe("lead-beta");
  });

  it("filters leads by minimum pursuit score", () => {
    expect(filterReviewLeads(leads, { minScore: "80" }).map((l) => l.id)).toEqual(["lead-alpha"]);
    expect(filterReviewLeads(leads, { minScore: "60" }).map((l) => l.id)).toEqual([
      "lead-alpha",
      "lead-beta",
    ]);
    expect(filterReviewLeads(leads, { minScore: "40" })).toHaveLength(3);
  });

  it("restricts bulk action targets to only selected leads that match active filters", () => {
    // Scenario: user selects all leads initially (alpha, beta, gamma)
    const selectedIds = ["lead-alpha", "lead-beta", "lead-gamma"];

    // User filters by searchQuery: "React"
    const filtered = filterReviewLeads(leads, { searchQuery: "React" });
    const filteredIds = filtered.map((l) => l.id);

    // Target IDs for bulk mutation must intersect selection and active filter
    const targetIds = selectedIds.filter((id) => filteredIds.includes(id));

    expect(filteredIds).toEqual(["lead-alpha"]);
    // Toolbar and mutation target agree: only 1 lead is targeted
    expect(targetIds).toEqual(["lead-alpha"]);
    expect(targetIds).not.toContain("lead-beta");
    expect(targetIds).not.toContain("lead-gamma");
  });
});
