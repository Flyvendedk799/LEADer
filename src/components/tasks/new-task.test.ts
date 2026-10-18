import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { NewTask } from "./new-task";

describe("NewTask component", () => {
  it("renders priority select with LOW, MEDIUM default, HIGH, URGENT options", () => {
    const html = renderToStaticMarkup(
      React.createElement(NewTask, {
        deals: [{ id: "deal-1", title: "Enterprise Pilot" }],
      }),
    );

    expect(html).toContain('name="priority"');
    expect(html).toContain('aria-label="Task priority"');
    expect(html).toContain('value="LOW"');
    expect(html).toContain('value="MEDIUM"');
    expect(html).toContain('value="HIGH"');
    expect(html).toContain('value="URGENT"');
    expect(html).toContain("Low priority");
    expect(html).toContain("Medium priority");
    expect(html).toContain("High priority");
    expect(html).toContain("Urgent priority");
  });

  it("renders quick date presets for local calendar shortcuts", () => {
    const html = renderToStaticMarkup(
      React.createElement(NewTask, { deals: [] }),
    );

    expect(html).toContain("Quick date:");
    expect(html).toContain("Today");
    expect(html).toContain("Tomorrow");
    expect(html).toContain("Next week");
  });

  it("applies responsive grid classes accommodating priority select across breakpoints", () => {
    const html = renderToStaticMarkup(React.createElement(NewTask, { deals: [] }));

    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain(
      "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_10rem_auto]",
    );
  });
});
