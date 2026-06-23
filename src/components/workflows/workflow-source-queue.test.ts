import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { WorkflowSourceQueue, type WorkflowSourceItem } from "./workflow-source-queue";

const source: WorkflowSourceItem = {
  id: "source-1",
  name: "Udbud feed",
  url: "https://example.com/feed",
  type: "RSS",
  workspace: "DK",
  frequency: "DAILY",
  enabled: true,
  lastCheckedAt: null,
  automatable: true,
  due: false,
};

describe("WorkflowSourceQueue", () => {
  it("uses the global due source count for the run-due action", () => {
    const html = renderToStaticMarkup(React.createElement(WorkflowSourceQueue, { sources: [source], dueCount: 3 }));

    expect(html).toContain("Run due (3)");
    expect(html).toContain("Run all due automatable sources");
  });

  it("disables run-due when no automatable sources are due", () => {
    const html = renderToStaticMarkup(React.createElement(WorkflowSourceQueue, { sources: [source], dueCount: 0 }));

    expect(html).toContain("No automatable sources are due");
    expect(html).toContain("disabled");
  });
});
