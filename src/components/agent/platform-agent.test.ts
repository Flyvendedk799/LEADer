import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { agentToolResultAction } from "./platform-agent";

describe("platform agent tool result actions", () => {
  it("links discovery and research tool results back to their durable runs", () => {
    expect(
      agentToolResultAction({
        tool: "run_discovery_lane",
        title: "Discovery mission complete",
        summary: "Ran discovery.",
        data: { missionId: "mission 1" },
      }),
    ).toEqual({ href: "/discover?mission=mission%201", label: "Open mission" });

    expect(
      agentToolResultAction({
        tool: "queue_research_brief",
        title: "Research brief queued",
        summary: "Queued research.",
        data: { href: "/workflows/runs/run-1", runId: "run-1" },
      }),
    ).toEqual({ href: "/workflows/runs/run-1", label: "Open run" });
  });

  it("does not invent links for generic tool results", () => {
    expect(
      agentToolResultAction({
        tool: "search_crm",
        title: "CRM search",
        summary: "Found records.",
      }),
    ).toBeNull();
  });
});
