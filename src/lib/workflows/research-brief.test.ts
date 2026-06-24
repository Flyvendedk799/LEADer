import { describe, expect, it } from "vitest";

import {
  buildResearchChecklist,
  buildResearchRunbook,
  buildResearchWorksheet,
  normalizeResearchBriefOptions,
} from "./research-brief";

describe("research brief workflow helpers", () => {
  it("infers practical contact or verification intent from raw clues", () => {
    expect(normalizeResearchBriefOptions({ subject: "Mette Jensen" })).toMatchObject({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
    });
    expect(normalizeResearchBriefOptions({ subject: "mette.jensen@northwind.dk" })).toMatchObject({
      subjectType: "person",
      objective: "find-contact",
    });
    expect(normalizeResearchBriefOptions({ subject: "info@northwind.dk" })).toMatchObject({
      subjectType: "company",
      objective: "find-contact",
    });
    expect(normalizeResearchBriefOptions({ subject: "northwind.dk" })).toMatchObject({
      subjectType: "company",
      objective: "find-contact",
    });
    expect(normalizeResearchBriefOptions({ subject: "+45 12 34 56 78" })).toMatchObject({
      subjectType: "unknown",
      objective: "verify-identity",
    });
  });

  it("normalizes operator-style research requests into clean subjects", () => {
    expect(normalizeResearchBriefOptions({ subject: "Find phone number for Mette Jensen" })).toMatchObject({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
      depth: "standard",
    });

    expect(normalizeResearchBriefOptions({ subject: "Map opportunity around Acme Robotics top to bottom" })).toMatchObject({
      subject: "Acme Robotics",
      subjectType: "company",
      objective: "map-opportunity",
      depth: "deep",
    });

    expect(normalizeResearchBriefOptions({ subject: "Who is +45 12 34 56 78?" })).toMatchObject({
      subject: "+45 12 34 56 78",
      objective: "verify-identity",
    });
  });

  it("treats explicit opportunity mapping as company-shaped even for two-word subjects", () => {
    expect(
      normalizeResearchBriefOptions({
        subject: "Acme Robotics",
        objective: "map-opportunity",
      }),
    ).toMatchObject({
      subject: "Acme Robotics",
      subjectType: "company",
      objective: "map-opportunity",
    });
  });

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

  it("keeps Danish search pivots in international research briefs", () => {
    const options = normalizeResearchBriefOptions({
      subject: "Nordic SaaS-opgaver",
      subjectType: "company",
      objective: "map-opportunity",
      depth: "standard",
    });

    const checklist = buildResearchChecklist(options, "GLOBAL");
    const worksheet = buildResearchWorksheet(options, "GLOBAL");
    const runbook = buildResearchRunbook(options, "GLOBAL");
    const promptText = [
      ...checklist.flatMap((step) => step.searchPrompts),
      ...worksheet.flatMap((section) => section.fields.flatMap((field) => field.sourcePrompts)),
      ...runbook.flatMap((step) => step.searchPrompts),
    ].join(" ");

    expect(promptText).toContain('"Nordic SaaS-opgaver" tender');
    expect(promptText).toContain('"Nordic SaaS-opgaver" procurement');
    expect(promptText).toContain('"Nordic SaaS-opgaver" udbud');
    expect(promptText).toContain('"Nordic SaaS-opgaver" offentligt indkøb');
    expect(promptText).toContain('"Nordic SaaS-opgaver" leverandør');
    expect(promptText).toContain('"Nordic SaaS-opgaver" kontakt');
    expect(promptText).toContain('"Nordic SaaS-opgaver" virksomhedsregister');
    expect(promptText).not.toContain("site:proff.dk OR site:datacvr.virk.dk");
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
      expect.arrayContaining([
        "false-positives",
        "route-owner",
        "domain-pattern",
        "phone",
        "email",
        "fallback-route",
        "recommended-action",
      ]),
    );
    expect(fields.find((field) => field.id === "phone")?.sourcePrompts).toEqual(
      expect.arrayContaining(['"Mette Jensen" phone', '"Mette Jensen" telefon']),
    );
    expect(fields.find((field) => field.id === "primary-route")?.evidence).toContain("official");
    expect(fields.find((field) => field.id === "route-owner")?.capture).toContain("same-name match");
    expect(fields.find((field) => field.id === "domain-pattern")?.evidence).toContain("unverified");
    expect(fields.find((field) => field.id === "recommended-action")?.capture).toContain("stop");
  });

  it("extracts structured pivots from an email clue", () => {
    const options = normalizeResearchBriefOptions({
      subject: "mette.jensen@northwind.dk",
      objective: "find-contact",
      depth: "standard",
    });

    const worksheet = buildResearchWorksheet(options, "DK");
    const fields = worksheet.flatMap((section) => section.fields);
    const inputPivots = fields.find((field) => field.id === "input-pivots");

    expect(inputPivots?.capture).toContain("email: mette.jensen@northwind.dk");
    expect(inputPivots?.capture).toContain("domain: northwind.dk");
    expect(inputPivots?.capture).toContain("name hint: mette jensen");
    expect(inputPivots?.sourcePrompts).toEqual(
      expect.arrayContaining(['"mette.jensen@northwind.dk"', "site:northwind.dk", '"mette jensen"']),
    );
    const domainPattern = fields.find((field) => field.id === "domain-pattern");
    expect(domainPattern?.sourcePrompts).toEqual(
      expect.arrayContaining(['site:northwind.dk "mette.jensen@northwind.dk"', '"mette jensen" site:northwind.dk']),
    );

    const runbook = buildResearchRunbook(options, "DK");
    expect(runbook.find((step) => step.id === "resolve-subject")?.capture.join(" ")).toContain(
      "Structured input pivots",
    );
    expect(runbook.find((step) => step.id === "search-public-surfaces")?.capture.join(" ")).toContain(
      "Domain/email pattern candidates marked unverified",
    );
    expect(runbook.flatMap((step) => step.searchPrompts)).toEqual(
      expect.arrayContaining(["site:northwind.dk", "northwind.dk kontakt", '"mette jensen" site:northwind.dk']),
    );
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
      "search-public-surfaces",
      "contact-route-ladder",
      "next-action",
    ]);
    expect(runbook.find((step) => step.id === "search-public-surfaces")?.capture).toEqual(
      expect.arrayContaining([
        "Official organization domain",
        "Staff/team, press, or department page",
        "Same-name false positives ruled out",
      ]),
    );
    expect(runbook.find((step) => step.id === "search-public-surfaces")?.searchPrompts).toEqual(
      expect.arrayContaining(['"Mette Jensen" site:linkedin.com/in', '"Mette Jensen" medarbejder']),
    );
    expect(runbook.find((step) => step.id === "contact-route-ladder")?.routePriority).toEqual([
      "Official organization contact page or switchboard",
      "Staff/team page, role inbox, or department page",
      "Public professional profile tied to current organization",
      "Direct phone/email only when intentionally public and tied to the exact subject",
    ]);
    expect(runbook.flatMap((step) => step.searchPrompts)).toEqual(
      expect.arrayContaining(['"Mette Jensen" kontakt', '"Mette Jensen" telefon']),
    );
    expect(runbook.find((step) => step.id === "next-action")?.stopWhen).toContain("single sentence");
  });

  it("keeps quick person contact runbooks practical without dropping the route decision", () => {
    const options = normalizeResearchBriefOptions({
      subject: "Mette Jensen",
      subjectType: "person",
      objective: "find-contact",
      depth: "quick",
    });

    const runbook = buildResearchRunbook(options, "DK");

    expect(runbook.map((step) => step.id)).toEqual([
      "resolve-subject",
      "current-affiliation",
      "search-public-surfaces",
      "contact-route-ladder",
    ]);
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
