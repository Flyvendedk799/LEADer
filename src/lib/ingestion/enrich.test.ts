import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({
  runAi: vi.fn(async () => ({ action: "summarize", model: "mock-llm", mocked: true, text: "mock" })),
}));
vi.mock("@/lib/ai/provider", () => ({
  hasLlm: vi.fn(() => true),
}));

import { runAi } from "@/lib/ai";
import { hasLlm } from "@/lib/ai/provider";
import { enrichOpportunityText, parseEnrichment } from "./enrich";

describe("parseEnrichment", () => {
  it("splits summary, why, and next from one model reply", () => {
    expect(
      parseEnrichment("A funded SME wants a reporting workflow.\nWhy: Small scoped software work.\nNext: Email the buyer."),
    ).toEqual({
      aiSummary: "A funded SME wants a reporting workflow.",
      whyRelevant: "Small scoped software work.",
      nextAction: "Email the buyer.",
    });
  });
});

describe("enrichOpportunityText", () => {
  it("skips the write when the gateway would return the offline mock", async () => {
    await expect(
      enrichOpportunityText({ title: "Lead", description: "Details", aiKeys: { provider: "openai" } }),
    ).resolves.toBeNull();
  });

  it("skips when no real model is configured", async () => {
    vi.mocked(runAi).mockClear();
    vi.mocked(hasLlm).mockReturnValueOnce(false);
    await expect(enrichOpportunityText({ title: "Lead" })).resolves.toBeNull();
    expect(runAi).not.toHaveBeenCalled();
  });
});
