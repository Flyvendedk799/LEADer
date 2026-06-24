import { describe, expect, it } from "vitest";

import {
  researchBriefClueSummaryFromResult,
  researchBriefDecisionFocusFromFrame,
  researchBriefDecisionFrameFromResult,
  researchBriefRunbookFromResult,
  researchBriefWorksheetFromResult,
} from "./research-brief-result";

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

  it("preserves saved clue summaries and reconstructs them for older runs", () => {
    expect(
      researchBriefClueSummaryFromResult({
        subject: "Mette Jensen",
        clueSummary: [{ id: "phone", label: "Phone", value: "+45 12 34 56 78" }],
      }),
    ).toEqual([{ id: "phone", label: "Phone", value: "+45 12 34 56 78" }]);

    expect(
      researchBriefClueSummaryFromResult(
        { createdTasks: 0 },
        {
          options: {
            researchBrief: {
              subject: "mette.jensen@northwind.dk",
            },
          },
        },
      ),
    ).toEqual(
      expect.arrayContaining([
        { id: "email", label: "Email", value: "mette.jensen@northwind.dk" },
        { id: "domain", label: "Domain", value: "northwind.dk" },
        { id: "name-hint", label: "Name hint", value: "mette jensen" },
      ]),
    );
  });

  it("preserves and reconstructs operator decision frames", () => {
    const saved = researchBriefDecisionFrameFromResult({
      subject: "Mette Jensen",
      decisionFrame: {
        id: "saved-decision",
        title: "Saved decision",
        purpose: "Saved purpose",
        outcomes: ["use route"],
        confidenceScale: ["high"],
        fields: [
          {
            id: "next-action",
            label: "Next action",
            prompt: "Saved prompt",
            evidence: "Saved evidence",
            sourcePrompts: ["Mette Jensen contact"],
          },
        ],
      },
    });

    expect(saved).toMatchObject({
      id: "saved-decision",
      title: "Saved decision",
      fields: [{ id: "next-action", label: "Next action" }],
    });

    const reconstructed = researchBriefDecisionFrameFromResult(
      { createdTasks: 0 },
      "DK",
      {
        options: {
          researchBrief: {
            subject: "Find phone number for Mette Jensen",
          },
        },
      },
    );

    expect(reconstructed?.fields.map((field) => field.id)).toEqual(
      expect.arrayContaining(["primary-route", "phone-or-switchboard", "route-ownership", "next-action"]),
    );
    expect(reconstructed?.outcomes).toContain("use primary route");
  });

  it("selects operator decision focus fields for clue-based contact runs", () => {
    const frame = researchBriefDecisionFrameFromResult(
      { createdTasks: 0 },
      "DK",
      {
        options: {
          researchBrief: {
            subject: "mette.jensen@northwind.dk",
            objective: "find-contact",
          },
        },
      },
    );
    const focus = researchBriefDecisionFocusFromFrame(frame, 5);

    expect(focus.outcomes).toEqual(["use primary route", "use fallback route", "keep researching", "do not contact yet"]);
    expect(focus.fields.map((field) => field.id)).toEqual([
      "clue-ownership",
      "clue-use",
      "primary-route",
      "phone-or-switchboard",
      "email-or-inbox",
    ]);
  });

  it("selects opportunity status before generic evidence fields", () => {
    const frame = researchBriefDecisionFrameFromResult(
      { createdTasks: 0 },
      "DK",
      {
        options: {
          researchBrief: {
            subject: "Aarhus Kommune",
            subjectType: "company",
            objective: "map-opportunity",
            depth: "deep",
          },
        },
      },
    );
    const focus = researchBriefDecisionFocusFromFrame(frame, 4);

    expect(focus.fields.map((field) => field.id)).toEqual([
      "opportunity-status",
      "buyer-trigger",
      "buying-route",
      "strongest-evidence",
    ]);
  });
});
