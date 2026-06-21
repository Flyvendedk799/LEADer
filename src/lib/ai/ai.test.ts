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
});
