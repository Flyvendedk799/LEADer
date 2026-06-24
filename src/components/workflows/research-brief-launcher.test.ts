import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { RESEARCH_BRIEF_STARTERS, ResearchBriefLauncher } from "./research-brief-launcher";

describe("ResearchBriefLauncher", () => {
  it("renders practical starter presets for common research flows", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResearchBriefLauncher, { defaultSubject: "Mette Jensen" }),
    );

    expect(RESEARCH_BRIEF_STARTERS.map((starter) => starter.id)).toEqual([
      "name-contact",
      "company-contact",
      "clue-lookup",
      "opportunity-map",
      "verify-match",
    ]);
    expect(RESEARCH_BRIEF_STARTERS.find((starter) => starter.id === "name-contact")).toMatchObject({
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
    });
    expect(RESEARCH_BRIEF_STARTERS.find((starter) => starter.id === "opportunity-map")).toMatchObject({
      subjectType: "company",
      objective: "map-opportunity",
      depth: "deep",
    });
    expect(html).toContain("Name to contact");
    expect(html).toContain("Company contact");
    expect(html).toContain("Clue lookup");
    expect(html).toContain("Opportunity map");
    expect(html).toContain("Verify match");
    expect(html).toContain("find contact");
    expect(html).toContain("Resolve the exact subject");
    expect(html).toContain("Find current affiliation");
    expect(html).toContain("Mette Jensen");
  });

  it("renders detected clue pivots in the preview", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResearchBriefLauncher, { defaultSubject: "mette.jensen@northwind.dk" }),
    );

    expect(html).toContain("Email: mette.jensen@northwind.dk");
    expect(html).toContain("Domain: northwind.dk");
    expect(html).toContain("Name hint: mette jensen");
    expect(html).toContain("find contact");
  });
});
