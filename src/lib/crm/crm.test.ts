import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVERY_LANES, laneCandidateGate, laneFit, laneMissionQueries, missionQuery } from "./lanes";
import { confidenceScore, pursuitScore } from "./scoring";

describe("CRM discovery lanes", () => {
  it("ships the six initial client-acquisition lanes", () => {
    expect(DEFAULT_DISCOVERY_LANES.map((lane) => lane.slug)).toEqual([
      "funded-work",
      "direct-startup-mvp",
      "sme-ai-automation",
      "tenders-procurement",
      "community-manual",
      "warm-network",
    ]);
  });

  it("keeps community and warm-network lanes manual-first", () => {
    const community = DEFAULT_DISCOVERY_LANES.find((lane) => lane.slug === "community-manual");
    const warm = DEFAULT_DISCOVERY_LANES.find((lane) => lane.slug === "warm-network");
    expect(community?.sourceTypes).toEqual(["FACEBOOK_MANUAL", "UPLOAD", "MANUAL"]);
    expect(warm?.sourceTypes).toContain("MANUAL");
  });

  it("builds a mission query from lane defaults plus refinement", () => {
    const lane = DEFAULT_DISCOVERY_LANES[1];
    expect(missionQuery(lane, "Copenhagen founders")).toContain("Copenhagen founders");
    expect(missionQuery(lane)).toBe(lane.queryTemplates[0]);
  });

  it("expands a lane into several deduped mission probes", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "sme-ai-automation")!;
    const queries = laneMissionQueries(lane, "finance reporting workflows", 4);
    expect(queries).toHaveLength(4);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries.every((query) => query.includes("finance reporting workflows") || query.includes(lane.name))).toBe(true);
  });

  it("rewards lane evidence and penalizes negative filters", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "direct-startup-mvp")!;
    const strong = laneFit(lane, {
      title: "Founder needs MVP prototype and fullstack technical partner",
      description: "Pre-seed startup wants a product roadmap and prototype sprint this month.",
      organization: "Nordic Founder Studio",
      url: "https://example.com",
      sourceKind: "web-search",
    });
    const weak = laneFit(lane, {
      title: "Unpaid internship job posting only",
      description: "Equity only community role with no paid build scope.",
      sourceKind: "web-search",
    });
    expect(strong.delta).toBeGreaterThan(weak.delta);
    expect(strong.evidenceMatches.length).toBeGreaterThan(weak.evidenceMatches.length);
    expect(weak.blockedKeywords.length).toBeGreaterThan(0);
  });

  it("keeps the tender lane focused on concrete active software tenders", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;

    expect(
      laneCandidateGate(lane, {
        title: "Tech & Startup Jobs in Denmark",
        description: "Full-time developer job and cofounder roles.",
        url: "https://thehub.io/jobs/location/denmark/copenhagen",
        candidateKind: "opportunity",
      }),
    ).toEqual({ allowed: false, reason: "job/recruiting result" });

    expect(
      laneCandidateGate(lane, {
        title: "Udbud_076502.pdf",
        description: "Softwareudvikling med CV'er og tilbud.",
        url: "https://udbud.dk/udbud/arkiv/udbud/76502/vedhaeftning/Udbud_076502.pdf",
        candidateKind: "opportunity",
      }),
    ).toEqual({ allowed: false, reason: "archived tender URL" });

    expect(
      laneCandidateGate(lane, {
        title: "Latest IT-Software Tenders & Government Contracts",
        description: "A tender portal and database of IT tenders.",
        url: "https://tenderimpulse.com/it-software-tenders",
        candidateKind: "source",
      }),
    ).toEqual({ allowed: false, reason: "generic tender source, not a concrete opportunity" });

    expect(
      laneCandidateGate(lane, {
        title: "Udvikling og drift af moderniseret datafordeler",
        description: "Offentligt udbud om software udvikling, drift, vedligeholdelse og support. Tilbudsfrist 30-06-2026.",
        url: "https://www.mercell.com/da-dk/udbud/147043739/udvikling-og-drift-af-moderniseret-datafordeler-udbud.aspx",
        organization: "Digitaliseringsstyrelsen",
        candidateKind: "opportunity",
        deadline: "2026-06-30T12:00:00.000Z",
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: true });

    expect(
      laneCandidateGate(lane, {
        title: "udbud.dk detaljevisning",
        description: "Beskrivelse: kontrakt om drift, vedligehold, support og udvikling af eksisterende webshopløsning. Tilbudsfrist.",
        rawContent:
          "Ordregivers eksisterende webshopløsning er baseret på Magento. Leverandøren vil være ansvarlig for hosting, drift, support, vedligehold og udvikling.",
        url: "https://udbud.dk/detaljevisning?noticeId=794e64fd-0135-4a5f-95e0-9decd15f2a99&noticePublicationNumber=00090691-2025",
        organization: "Offentlig ordregiver",
        candidateKind: "source",
      }),
    ).toEqual({ allowed: true });

    expect(
      laneCandidateGate(lane, {
        title: "Udbud for Drift, Support og Vedligehold for Projektweb og Facility Management system",
        description:
          "Vi gør rejsen til det gode offentlige udbud nem og effektiv, og giver alle leverandører lige muligheder for at vinde.",
        rawContent:
          "Udbud for Drift, Support og Vedligehold for Projektweb og Facility Management system. Offentlige organisationer bruger Mercell til at offentliggøre deres udbud.",
        url: "https://www.mercell.com/da-dk/udbud/220463184/udbud-for-drift-support-og-vedligehold-for-projektweb-og-facility-management-system-udbud.aspx",
        organization: "Mercell",
        candidateKind: "source",
      }),
    ).toEqual({ allowed: true });

    expect(
      laneCandidateGate(lane, {
        title: "udbud.dk",
        description:
          "Udbud.dk er en central kilde til at finde offentlige udbud og IT-, app-, web- og digitaliseringsopgaver.",
        rawContent:
          "Yderligere oplysninger: Ordregiver skal i medfør af udbudslovens § 134 a udelukke tilbudsgivere fra visse lande.",
        url: "https://udbud.dk/detaljevisning?noticeId=25fcb64c-21d7-42a2-bffa-004f788663ce&noticeVersion=01&noticePublicationNumber=00108981-2025",
        organization: "Udbud",
        candidateKind: "source",
      }),
    ).toEqual({ allowed: false, reason: "missing software/technical scope" });

    expect(
      laneCandidateGate(lane, {
        title: "Tailored biosafety lab training and UVI sensor PoC support for Kihleo",
        description:
          "Danish Life Science Cluster søger via Beyond Beta en leverandør til skræddersyet biosafety lab training og PoC-support med tilbudsfrist 01-07-2026.",
        rawContent:
          "04-06-2026 01-07-2026 14.44 Danish Life Science Cluster Beyond Beta Tailored biosafety lab training and UVI sensor PoC support for Kihleo",
        url: "https://beyondbeta.ehsys.dk/indkoeb/tilbud/indsend/f576aa3a-c671-450f-4f38-08debfdbb015",
        candidateKind: "opportunity",
        deadline: "2026-07-01T12:44:00.000Z",
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "missing software/technical scope" });
  });
});

describe("CRM scoring helpers", () => {
  it("rewards candidates with concrete evidence", () => {
    const weak = confidenceScore({});
    const strong = confidenceScore({
      hasUrl: true,
      hasBudget: true,
      hasDeadline: true,
      hasOrganization: true,
      evidenceCount: 2,
      sourceKind: "source-scan",
    });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(100);
  });

  it("combines match, confidence, urgency and priority into pursuit score", () => {
    const soon = new Date(Date.now() + 3 * 86400000);
    const later = new Date(Date.now() + 120 * 86400000);
    expect(pursuitScore({ matchScore: 80, confidenceScore: 80, deadline: soon, priority: 2 }))
      .toBeGreaterThan(pursuitScore({ matchScore: 80, confidenceScore: 80, deadline: later, priority: 0 }));
  });
});
