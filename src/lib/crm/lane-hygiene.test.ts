import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVERY_LANES } from "./lanes";
import { invalidLaneCandidateReason } from "./lane-hygiene";

describe("lane hygiene", () => {
  it("identifies persisted candidates that no longer satisfy their lane", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const activeDeadline = new Date(Date.now() + 14 * 86400000).toISOString();

    expect(
      invalidLaneCandidateReason({
        lane,
        title: "udbud.dk",
        description: "Legacy udbud page with software scope and tilbudsfrist.",
        rawContent: "Softwareudvikling. Tilbudsfrist 30-06-2099.",
        url: "https://udbud.dk/Pages/Tenders/ShowTender?tenderid=61801",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toBe("legacy udbud.dk archive URL");

    expect(
      invalidLaneCandidateReason({
        lane,
        title: "Levering, drift, vedligeholdelse og support af It-driftsstyringssystem",
        description: "Aktivt udbud om IT-driftsstyringssystem.",
        rawContent: "Ordregiver: I/S Amager Ressourcecenter. CPV: 72000000. Tilbudsfrist 07-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=3c00bf59-28cd-47e0-9018-dff8cac2df3e&noticeVersion=01",
        organization: "I/S Amager Ressourcecenter",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toBeNull();
  });

  it("catches persisted research-policy tenders that only mention incidental software work", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const activeDeadline = new Date(Date.now() + 14 * 86400000).toISOString();

    expect(
      invalidLaneCandidateReason({
        lane,
        title:
          "EEA/CCE/TC/26/004 - Topic Centre on Sustainability and Decarbonisation of EU's Transport Sector - new TC, 2.1, 2.2, 2.3",
        description:
          "Support for collecting, quality checking, verifying reported data and disseminating transport-related data under Regulation (EU).",
        rawContent:
          "Ordregiver: European Environment Agency (EEA). CPV: 73000000 Forsknings- og udviklingsvirksomhed. Topic Centre support for reported transport data under Regulation (EU). Support with reporting dataflows and database structure. Support with methodological, technical and software maintenance and development of the COPERT model. Tilbudsfrist 29-06-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=3025d5d3-08f1-40bd-a54d-bd17344f1693&noticeVersion=01",
        organization: "European Environment Agency (EEA)",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toBe("research/policy services, not software delivery");
  });

  it("rejects social posts that only talk about tenders", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const activeDeadline = new Date(Date.now() + 14 * 86400000).toISOString();

    expect(
      invalidLaneCandidateReason({
        lane,
        title: "Dennis på LinkedIn: Jeg har fundet et software udbud",
        description: "Post om et aktivt udbud med tilbudsfrist 30-07-2099 og software scope.",
        rawContent:
          "LinkedIn opslag om udbud. CPV: 72000000. Softwareudvikling. Indsend tilbud via platform. Tilbudsfrist 30-07-2099.",
        url: "https://dk.linkedin.com/posts/dennis-software-udbud",
        organization: "LinkedIn",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toBe("social/profile result, not a tender notice");
  });

  it("rejects tender-like hits that do not identify the buyer", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const activeDeadline = new Date(Date.now() + 14 * 86400000).toISOString();

    expect(
      invalidLaneCandidateReason({
        lane,
        title: "Softwareudbud med aktiv tilbudsfrist",
        description: "Aktivt udbud om softwareudvikling, drift og support. Tilbudsfrist 30-07-2099.",
        rawContent:
          "CPV: 72000000. Softwareudvikling, drift og support. Indsend tilbud via platform. Tilbudsfrist 30-07-2099.",
        url: "https://example.com/tender/12345",
        sourceName: "Tender portal",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toBe("missing buyer/contracting authority evidence");
  });
});
