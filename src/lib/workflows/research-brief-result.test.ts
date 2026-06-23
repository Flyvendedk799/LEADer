import { describe, expect, it } from "vitest";

import { researchBriefRunbookFromResult, researchBriefWorksheetFromResult } from "./research-brief-result";

describe("research brief result fallbacks", () => {
  it("reconstructs missing runbooks for older successful research runs", () => {
    const runbook = researchBriefRunbookFromResult({
      subject: "Mette Jensen worksheet smoke",
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
      workspace: "DK",
    });

    expect(runbook.map((step) => step.id)).toEqual([
      "resolve-subject",
      "current-affiliation",
      "search-public-surfaces",
      "contact-route-ladder",
      "next-action",
    ]);
  });

  it("uses input options when older result JSON only has generic completion fields", () => {
    const runbook = researchBriefRunbookFromResult(
      { createdTasks: 0, skippedExistingTasks: 0 },
      "DK",
      {
        options: {
          researchBrief: {
            subject: "Aarhus Kommune",
            subjectType: "company",
            objective: "map-opportunity",
            depth: "quick",
          },
        },
      },
    );

    expect(runbook.map((step) => step.id)).toEqual([
      "resolve-subject",
      "opportunity-signal-map",
      "next-action",
    ]);
  });

  it("preserves saved artifacts instead of regenerating them", () => {
    expect(
      researchBriefRunbookFromResult({
        subject: "Mette Jensen",
        runbook: [{ id: "saved-step", title: "Saved step" }],
      }),
    ).toEqual([{ id: "saved-step", title: "Saved step" }]);
  });

  it("reconstructs missing worksheets for old runs", () => {
    const worksheet = researchBriefWorksheetFromResult({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
    });

    expect(worksheet.map((section) => section.id)).toContain("contact-route");
  });
});
