import { afterEach, describe, expect, it } from "vitest";

import { runAi } from "./index";
import type { DiscoveryAiSearchPlan } from "@/lib/types";

describe("AI gateway", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a structured mock plan for freeform discovery search", async () => {
    process.env.LLM_API_KEY = "";
    const result = await runAi({
      action: "planDiscoverySearch",
      context: "Freeform brief:\nFind Danish SMEs with spreadsheet-heavy reporting workflows and AI automation pain.",
    });
    const plan = result.data as DiscoveryAiSearchPlan;

    expect(result.mocked).toBe(true);
    expect(plan.queries.length).toBeGreaterThanOrEqual(3);
    expect(plan.excludedTerms).toContain("webinar");
    expect(plan.evidenceRequirements.length).toBeGreaterThan(0);
  });

  it("keeps Danish intent when mock-planning an international discovery search", async () => {
    process.env.LLM_API_KEY = "";
    const result = await runAi({
      action: "planDiscoverySearch",
      context:
        "Freeform brief:\nFind internationale SaaS-opgaver hvor en dansk fullstack-konsulent kan hjælpe med AI automatisering.\n\nWorkspace: GLOBAL",
    });
    const plan = result.data as DiscoveryAiSearchPlan;
    const queryText = plan.queries.join(" ").toLowerCase();

    expect(result.mocked).toBe(true);
    expect(queryText).toContain("international");
    expect(queryText).toMatch(/dansk|fjernarbejde|softwareudvikling|leverandør/);
    expect(queryText).not.toMatch(/\bdenmark\b/);
  });

  it("falls back to mock output when a selected Codex subscription is not logged in", async () => {
    process.env.CODEX_AUTH_FILE = "/tmp/leader-missing-codex-auth.json";
    const result = await runAi({
      action: "planDiscoverySearch",
      aiKeys: { provider: "codex" },
      context: "Freeform brief:\nFind danske udbud om softwareudvikling.",
    });

    expect(result.mocked).toBe(true);
    expect(result.model).toBe("mock-llm");
  });
});
