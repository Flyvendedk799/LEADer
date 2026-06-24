import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { candidateKindLabel, discoveryResultProviderLabel } from "./discovery-workbench";

describe("discovery workbench labels", () => {
  it("labels official udbud.dk results as official search even without a broad search key", () => {
    expect(discoveryResultProviderLabel({ provider: "udbud.dk", providerConfigured: false })).toBe(
      "official udbud.dk",
    );
    expect(discoveryResultProviderLabel({ provider: "brave", providerConfigured: true })).toBe("brave search");
    expect(discoveryResultProviderLabel({ provider: "none", providerConfigured: false })).toBe("source scan");
  });

  it("only calls tender/procurement candidates udbud", () => {
    expect(
      candidateKindLabel({
        candidateKind: "opportunity",
        category: "Tender",
        sourceName: "udbud.dk",
        provider: "udbud.dk",
        signals: ["deadline", "udbud"],
      }),
    ).toBe("Udbud");
    expect(
      candidateKindLabel({
        candidateKind: "opportunity",
        category: "MVP / prototype",
        sourceName: "LinkedIn",
        provider: "brave",
        signals: ["startup"],
      }),
    ).toBe("Opportunity");
    expect(
      candidateKindLabel({
        candidateKind: "source",
        category: "Tender",
        sourceName: "Mercell",
        provider: "saved-sources",
        signals: ["udbud"],
      }),
    ).toBe("Source");
  });
});
