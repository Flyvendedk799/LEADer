import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import {
  RESEARCH_BRIEF_STARTERS,
  ResearchBriefLauncher,
  selectResearchPreviewRunbookSteps,
} from "./research-brief-launcher";
import { buildResearchRunbook, normalizeResearchBriefOptions } from "@/lib/workflows/research-brief";

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
    expect(html).toContain("Name to phone/email");
    expect(html).toContain("Resolve person, affiliation, and public route.");
    expect(html).toContain("Company route");
    expect(html).toContain("Email/domain/phone clue");
    expect(html).toContain("Top-to-bottom opportunity");
    expect(html).toContain("Verify same-name match");
    expect(html).toContain("find contact");
    expect(html).toContain("Resolve the exact subject");
    expect(html).toContain("Build the contact route ladder");
    expect(html).toContain("If no result:");
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

  it("previews objective-critical runbook steps instead of only the first steps", () => {
    const normalized = normalizeResearchBriefOptions({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
    });
    const steps = selectResearchPreviewRunbookSteps(buildResearchRunbook(normalized, "DK"), normalized.objective);

    expect(steps.map((step) => step.id)).toEqual([
      "resolve-subject",
      "search-public-surfaces",
      "contact-route-ladder",
      "next-action",
    ]);
  });
});
