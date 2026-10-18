import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUsePathname = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

import { DealTable } from "./deal-table";

const mockDeal = {
  id: "deal-1",
  ownerId: "user-1",
  title: "Test Deal",
  summary: "Deal summary",
  workspace: "DK",
  status: "QUALIFYING",
  valueMin: 10000,
  valueMax: 50000,
  currency: "DKK",
  deadline: new Date("2026-12-01"),
  pursuitScore: 88,
  priority: 1,
  nextAction: "Send proposal",
  accountId: null,
  laneId: null,
  rawContent: null,
  url: null,
  category: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  account: null,
  lane: null,
} as unknown as Parameters<typeof DealTable>[0]["deals"][0];

describe("DealTable component sorting controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/deals");
  });

  it("renders aria-sort on TableHead columnheader elements", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("workspace=DK&sort=score"));

    const html = renderToStaticMarkup(
      React.createElement(DealTable, { deals: [mockDeal], workspace: "DK" }),
    );

    // Match column is active with score -> aria-sort="descending"
    expect(html).toContain('aria-sort="descending"');
    // Inactive sort columns have aria-sort="none"
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('aria-label="Sort by Match"');
    expect(html).toContain('aria-label="Sort by Value"');
    expect(html).toContain('aria-label="Sort by Deadline"');
    expect(html).toContain('aria-label="Sort by Deal"');
  });

  it("sets aria-sort=ascending on deadline column when active", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("workspace=DK&sort=deadline"));

    const html = renderToStaticMarkup(
      React.createElement(DealTable, { deals: [mockDeal], workspace: "DK" }),
    );

    // Deadline column is ascending
    expect(html).toContain('aria-sort="ascending"');
  });

  it("builds sort links preserving existing filters and resetting pagination", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("workspace=GLOBAL&q=software&status=QUALIFYING&attention=deadline&page=3"),
    );

    const html = renderToStaticMarkup(
      React.createElement(DealTable, { deals: [mockDeal], workspace: "GLOBAL" }),
    );

    // Check sort link for value: retains workspace, q, status, attention and drops page=3
    expect(html).toContain("workspace=GLOBAL");
    expect(html).toContain("q=software");
    expect(html).toContain("status=QUALIFYING");
    expect(html).toContain("attention=deadline");
    expect(html).toContain("sort=value");
    expect(html).not.toContain("page=3");
  });
});
