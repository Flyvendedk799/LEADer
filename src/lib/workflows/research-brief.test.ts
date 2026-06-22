import { describe, expect, it } from "vitest";

import { buildResearchChecklist, normalizeResearchBriefOptions } from "./research-brief";

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
    expect(checklist.find((step) => step.stage === "contact")?.description).toContain("official switchboard");
    expect(checklist.flatMap((step) => step.searchPrompts)).toContain('"Mette Jensen" CVR');
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
    expect(checklist.flatMap((step) => step.searchPrompts).join(" ")).toContain("udbud");
  });

  it("keeps quick research brief short", () => {
    const options = normalizeResearchBriefOptions({
      subject: "example.com",
      depth: "quick",
    });

    expect(buildResearchChecklist(options, "GLOBAL")).toHaveLength(4);
  });
});
