import { describe, expect, it } from "vitest";

import { planMockToolCalls } from "./index";
import { AGENT_TOOL_CATALOG } from "./tools";

describe("platform agent", () => {
  it("plans a cockpit read for daily attention requests", () => {
    expect(planMockToolCalls("What needs my attention today?")).toEqual([
      { tool: "get_cockpit", args: { workspace: "DK" } },
    ]);
  });

  it("plans write tools for action requests", () => {
    const taskCalls = planMockToolCalls("Create a high priority follow-up task to call Acme tomorrow");
    expect(taskCalls[0]?.tool).toBe("create_task");
    expect(taskCalls[0]?.args).toMatchObject({ priority: "HIGH" });

    const discoveryCalls = planMockToolCalls("Run a wide AI automation discovery search for reporting workflows");
    expect(discoveryCalls[0]?.tool).toBe("run_discovery_lane");
    expect(discoveryCalls[0]?.args).toMatchObject({ laneSlug: "sme-ai-automation", searchMode: "wide", workspace: "DK" });

    const internationalCalls = planMockToolCalls("Run international tender discovery for software udbud");
    expect(internationalCalls[0]?.tool).toBe("run_discovery_lane");
    expect(internationalCalls[0]?.args).toMatchObject({ laneSlug: "tenders-procurement", workspace: "GLOBAL" });
  });

  it("plans practical research briefs for contact and opportunity lookup", () => {
    const contactCalls = planMockToolCalls("Find phone number for Mette Jensen");
    expect(contactCalls[0]?.tool).toBe("queue_research_brief");
    expect(contactCalls[0]?.args).toMatchObject({
      subject: "Mette Jensen",
      subjectType: "unknown",
      objective: "find-contact",
      depth: "standard",
      workspace: "DK",
      createTasks: true,
    });

    const opportunityCalls = planMockToolCalls("Map opportunity around Acme Robotics top to bottom");
    expect(opportunityCalls[0]?.tool).toBe("queue_research_brief");
    expect(opportunityCalls[0]?.args).toMatchObject({
      subject: "Acme Robotics",
      subjectType: "company",
      objective: "map-opportunity",
      depth: "deep",
    });
  });

  it("exposes both read and write platform tools", () => {
    const names = AGENT_TOOL_CATALOG.map((tool) => tool.name);
    expect(names).toContain("search_crm");
    expect(names).toContain("create_task");
    expect(names).toContain("update_deal");
    expect(names).toContain("run_discovery_lane");
    expect(names).toContain("queue_research_brief");
    expect(AGENT_TOOL_CATALOG.some((tool) => tool.risk === "read")).toBe(true);
    expect(AGENT_TOOL_CATALOG.some((tool) => tool.risk === "write")).toBe(true);
  });
});
