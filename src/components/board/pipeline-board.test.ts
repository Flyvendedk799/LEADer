import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { PipelineBoard, type BoardDeal } from "./pipeline-board";

const mockDeals: BoardDeal[] = [
  {
    id: "deal-1",
    title: "DKK Deal",
    status: "QUALIFYING",
    valueMin: 100000,
    valueMax: 200000,
    currency: "DKK",
    deadline: null,
    pursuitScore: 80,
    account: { name: "Test Corp" },
  },
  {
    id: "deal-2",
    title: "EUR Deal",
    status: "QUALIFYING",
    valueMin: 50000,
    valueMax: 50000,
    currency: "EUR",
    deadline: null,
    pursuitScore: 75,
    account: null,
  },
  {
    id: "deal-3",
    title: "Proposal Deal",
    status: "PROPOSAL",
    valueMin: 75000,
    valueMax: 75000,
    currency: "DKK",
    deadline: null,
    pursuitScore: 90,
    account: null,
  },
];

describe("PipelineBoard component", () => {
  it("renders per-currency board totals aggregated across all deals", () => {
    const html = renderToStaticMarkup(
      React.createElement(PipelineBoard, { initial: mockDeals }),
    );

    expect(html).toContain('aria-label="Board currency totals"');
    expect(html).toContain("Pipeline value:");
    // DKK total: 200,000 + 75,000 = 275,000
    expect(html).toContain("275.000 DKK");
    // EUR total: 50,000
    expect(html).toContain("50.000 EUR");
  });

  it("renders per-currency column totals for each status column", () => {
    const html = renderToStaticMarkup(
      React.createElement(PipelineBoard, { initial: mockDeals }),
    );

    // Qualifying column has both 200.000 DKK and 50.000 EUR
    expect(html).toContain('aria-label="Qualifying value totals"');
    expect(html).toContain("200.000 DKK");

    // Proposal column has 75.000 DKK
    expect(html).toContain('aria-label="Proposal value totals"');
    expect(html).toContain("75.000 DKK");
  });
});
