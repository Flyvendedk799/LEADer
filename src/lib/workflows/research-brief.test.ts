import { describe, expect, it } from "vitest";

import {
  buildResearchChecklist,
  buildResearchRunbook,
  buildResearchWorksheet,
  normalizeResearchBriefOptions,
} from "./research-brief";

describe("research brief workflow helpers", () => {
  it("builds a public-source contact checklist from a person clue", () => {
    const options = normalizeResearchBriefOptions({
      subject: "  Mette Jensen  ",
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
    });
    const checklist = buildResearchChecklist(options, "DK");

    expect(options.subject).toBe("Mette Jensen");
    expect(checklist.length).toBeGreaterThanOrEqual(6);
    expect(checklist.some((step) => step.stage === "contact" && step.priority === "URGENT")).toBe(true);
    expect(checklist.some((step) => step.stage === "affiliation" && step.priority === "URGENT")).toBe(true);
    expect(checklist.map((step) => step.stage).slice(0, 4)).toEqual([
      "identity",
      "affiliation",
      "sources",
      "contact",
    ]);
    expect(checklist.find((step) => step.stage === "contact")?.description).toContain("official switchboard");
    expect(checklist.find((step) => step.stage === "affiliation")?.description).toContain(
      "where this person currently works",
    );
    expect(checklist.find((step) => step.stage === "affiliation")?.acceptanceCriteria.join(" ")).toContain(
      "Current organization and role",
    );
    expect(checklist.map((step) => step.stage)).toContain("route-validation");
    expect(checklist.find((step) => step.stage === "route-validation")?.acceptanceCriteria.join(" ")).toContain(
      "primary route and fallback route",
    );
    expect(checklist.flatMap((step) => step.searchPrompts)).toContain('"Mette Jensen" officiel hjemmeside');
    expect(checklist.flatMap((step) => step.searchPrompts)).toContain('"Mette Jensen" CVR');
    expect(checklist.find((step) => step.stage === "contact")?.description).toContain("Do not use private leaked");
  });

  it("adds deeper investigation steps for opportunity mapping", () => {
    const options = normalizeResearchBriefOptions({
      subject: "Aarhus Kommune",
      subjectType: "company",
      objective: "map-opportunity",
      depth: "deep",
    });
    const checklist = buildResearchChecklist(options, "DK");
    const stages = checklist.map((step) => step.stage);

    expect(stages).toContain("timeline");
    expect(stages).toContain("network");
    expect(stages).toContain("procurement");
    expect(stages).toContain("source-log");
    expect(checklist.flatMap((step) => step.searchPrompts).join(" ")).toContain("udbud");
    expect(checklist.find((step) => step.stage === "procurement")?.acceptanceCriteria.join(" ")).toContain(
      "expired archives",
    );
  });

  it("keeps quick research brief short", () => {
    const options = normalizeResearchBriefOptions({
      subject: "example.com",
      depth: "quick",
    });

    const checklist = buildResearchChecklist(options, "GLOBAL");
    expect(checklist).toHaveLength(4);
    expect(checklist.map((step) => step.stage)).toEqual(["identity", "sources", "contact", "route-validation"]);
  });

  it("keeps quick person contact research in practical lookup order", () => {
    const options = normalizeResearchBriefOptions({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
      depth: "quick",
    });

    const checklist = buildResearchChecklist(options, "DK");
    expect(checklist).toHaveLength(4);
    expect(checklist.map((step) => step.stage)).toEqual(["identity", "affiliation", "contact", "route-validation"]);
    expect(checklist.find((step) => step.stage === "affiliation")?.searchPrompts).toEqual(
      expect.arrayContaining(['"Mette Jensen" firma', '"Mette Jensen" CVR']),
    );
  });

  it("builds a practitioner worksheet for name-to-contact research", () => {
    const options = normalizeResearchBriefOptions({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
    });

    const worksheet = buildResearchWorksheet(options, "DK");
    const sections = worksheet.map((section) => section.id);
    const fields = worksheet.flatMap((section) => section.fields);

    expect(sections).toEqual(
      expect.arrayContaining(["identity", "affiliation", "source-ledger", "contact-route", "next-action"]),
    );
    expect(fields.map((field) => field.id)).toEqual(
      expect.arrayContaining(["false-positives", "phone", "email", "fallback-route", "recommended-action"]),
    );
    expect(fields.find((field) => field.id === "phone")?.sourcePrompts).toEqual(
      expect.arrayContaining(['"Mette Jensen" phone', '"Mette Jensen" telefon']),
    );
    expect(fields.find((field) => field.id === "primary-route")?.evidence).toContain("official");
    expect(fields.find((field) => field.id === "recommended-action")?.capture).toContain("stop");
  });

  it("builds an operator runbook for practical name-to-contact lookup", () => {
    const options = normalizeResearchBriefOptions({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
    });

    const runbook = buildResearchRunbook(options, "DK");

    expect(runbook.map((step) => step.id)).toEqual([
      "resolve-subject",
      "current-affiliation",
      "contact-route-ladder",
      "next-action",
    ]);
    expect(runbook.find((step) => step.id === "contact-route-ladder")?.routePriority).toEqual([
      "Official switchboard or contact form",
      "Role inbox or department page",
      "Public professional profile",
      "Direct phone/email only when intentionally public and tied to the exact subject",
    ]);
    expect(runbook.flatMap((step) => step.searchPrompts)).toEqual(
      expect.arrayContaining(['"Mette Jensen" kontakt', '"Mette Jensen" telefon']),
    );
    expect(runbook.find((step) => step.id === "next-action")?.stopWhen).toContain("single sentence");
  });

  it("adds opportunity worksheet fields for deep company mapping", () => {
    const options = normalizeResearchBriefOptions({
      subject: "Aarhus Kommune",
      subjectType: "company",
      objective: "map-opportunity",
      depth: "deep",
    });

    const worksheet = buildResearchWorksheet(options, "DK");
    expect(worksheet.map((section) => section.id)).toEqual(
      expect.arrayContaining(["opportunity", "timeline-network"]),
    );
    expect(worksheet.flatMap((section) => section.fields).map((field) => field.id)).toEqual(
      expect.arrayContaining(["procurement-route", "timeline", "adjacent-contacts"]),
    );
  });
});
