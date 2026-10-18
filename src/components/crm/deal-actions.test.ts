import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { DealActions } from "./deal-actions";

describe("DealActions component", () => {
  it("renders lifecycle stepper and preserves Deal status combobox trigger", () => {
    const html = renderToStaticMarkup(
      React.createElement(DealActions, {
        dealId: "deal-1",
        accountId: "acc-1",
        status: "QUALIFYING",
      }),
    );

    // Stepper navigation and buttons
    expect(html).toContain('aria-label="Deal lifecycle stages"');
    expect(html).toContain('aria-label="Set status to Discovered"');
    expect(html).toContain('aria-label="Set status to Qualifying"');
    expect(html).toContain('aria-label="Set status to Proposal"');
    expect(html).toContain('aria-current="step"');

    // Combobox trigger strictly preserved
    expect(html).toContain('aria-label="Deal status"');
  });

  it("renders task creation form with priority selector and quick date shortcuts", () => {
    const html = renderToStaticMarkup(
      React.createElement(DealActions, {
        dealId: "deal-1",
        accountId: "acc-1",
        status: "QUALIFYING",
      }),
    );

    expect(html).toContain('aria-label="Task priority"');
    expect(html).toContain('aria-label="Task due date"');
    expect(html).toContain("Quick date:");
    expect(html).toContain("Today");
    expect(html).toContain("Tomorrow");
    expect(html).toContain("Next week");
  });
});
