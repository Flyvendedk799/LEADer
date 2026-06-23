import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISCOVERY_LANES,
  filterVisibleLaneCandidates,
  laneCandidateGate,
  laneFit,
  laneMissionQueries,
  missionQuery,
} from "./lanes";
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
    const activeDeadline = new Date(Date.now() + 90 * 86400000).toISOString();

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
        description: "A tender portal and database of IT tenders with alerts, buyers and deadlines.",
        url: "https://tenderimpulse.com/it-software-tenders",
        candidateKind: "opportunity",
      }),
    ).toEqual({ allowed: false, reason: "generic tender source, not a concrete opportunity" });

    expect(
      laneCandidateGate(lane, {
        title: "bids&tenders: Digital eProcurement Platform for USA & Canada",
        description: "bids&tenders is a digital eProcurement platform for public agencies.",
        url: "https://bidsandtenders.com/",
        candidateKind: "opportunity",
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "generic tender source, not a concrete opportunity" });

    expect(
      laneCandidateGate(lane, {
        title: "02.14 It-konsulenter (DIS)",
        description: "Dynamisk indkøbssystem for IT-konsulenter med lang løbetid.",
        rawContent: "CPV 72000000 It-tjenester. Tilbudsfrist 26-08-2049.",
        url: "https://udbud.dk/detaljevisning?noticeId=94ef2048-9a7b-4179-8d97-c179940adfa8&noticeVersion=01",
        organization: "Statens og Kommunernes Indkøbsservice",
        candidateKind: "opportunity",
        deadline: "2049-08-26T11:00:00.000Z",
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "long-running procurement system/catalogue" });

    expect(
      laneCandidateGate(lane, {
        title: "Udbud af rammeaftale om levering af IT-konsulentydelser inden for GIS",
        description:
          "Andel Holding A/S udbyder en rammeaftale om IT-konsulentydelser inden for GIS til flere fremtidige projekter. Tilbudsfrist 29-06-2099.",
        rawContent:
          "Ordregiver: Andel Holding A/S. Rammeaftale om levering af IT-konsulentydelser inden for GIS. Tilbudsfrist 29-06-2099. CPV: 72260000.",
        url: "https://udbud.dk/detaljevisning?noticeId=168a4125-b619-4401-b2a2-05ba7e218da3&noticeVersion=01",
        organization: "Andel Holding A/S",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "broad framework agreement" });

    expect(
      laneCandidateGate(lane, {
        title: "Udvikling og drift af moderniseret datafordeler",
        description: "Offentligt udbud om software udvikling, drift, vedligeholdelse og support. Tilbudsfrist 30-06-2099.",
        url: "https://www.mercell.com/da-dk/udbud/147043739/udvikling-og-drift-af-moderniseret-datafordeler-udbud.aspx",
        organization: "Digitaliseringsstyrelsen",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: true });

    expect(
      laneCandidateGate(lane, {
        title: "udbud.dk",
        description: "Beskrivelse: kontrakt om drift, vedligehold, support og udvikling af eksisterende webshopløsning. Tilbudsfrist.",
        rawContent:
          "Ordregivers eksisterende webshopløsning er baseret på Magento. Leverandøren vil være ansvarlig for hosting, drift, support, vedligehold og udvikling. Tilbudsfrist 30-06-2099.",
        url: "https://udbud.dk/Pages/Tenders/ShowTender?tenderid=61801",
        organization: "Offentlig ordregiver",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "legacy udbud.dk archive URL" });

    expect(
      laneCandidateGate(lane, {
        title: "UDVIKLING AF VESTKYST- APP",
        description: "Mulig opgave/udbud: udvikling af Vestkyst-app. Tilbudsfrist 30-06-2099.",
        rawContent: "Softwareudvikling. Tilbudsfrist 30-06-2099. Ordregiver: offentlig ordregiver.",
        url: "https://www.udbud.dk/Handlers/File.ashx?fileid=73810",
        organization: "Offentlig ordregiver",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "tender attachment, not notice page" });

    expect(
      laneCandidateGate(lane, {
        title: "EEA/CCE/TC/26/004 - Topic Centre on Sustainability and Decarbonisation of EU's Transport Sector",
        description:
          "Support for collecting, compiling, quality checking and verifying reported transport-sector data. Tilbudsfrist 29-06-2099.",
        rawContent:
          "Ordregiver: European Environment Agency. CPV: 73000000 Forsknings- og udviklingsvirksomhed. Topic Centre support for collecting, compiling, quality checking and verifying reported data under Regulation (EU). Tilbudsfrist 29-06-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=3025d5d3-08f1-40bd-a54d-bd17344f1693&noticeVersion=01",
        organization: "European Environment Agency",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "research/policy services, not software delivery" });

    expect(
      laneCandidateGate(lane, {
        title:
          "Udbud med forhandling vedr. levering, implementering, vedligeholdelse, support og udvikling af IT-løsning til understøttelse af Tolkeportalen",
        description:
          "Udbudsprocessen omfatter en kontrakt vedrørende levering, implementering, vedligeholdelse, support og udvikling af en IT-løsning. Ansøgning og tilbud håndteres via udbudsplatform.",
        rawContent:
          "Ordregiver: Social- og Boligstyrelsen. CPV: 72000000 It-tjenester: rådgivning, programmeludvikling, internet og support. Tilbudsfrist 25-08-2026.",
        url: "https://udbud.dk/detaljevisning?noticeId=3e7ca982-c07b-421e-ae75-c771014a708a&noticeVersion=01&noticePublicationNumber=00403929-2026",
        organization: "Social- og Boligstyrelsen",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
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
    ).toEqual({ allowed: false, reason: "missing active tender deadline" });

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
    ).toEqual({ allowed: false, reason: "generic tender title without active deadline" });

    expect(
      laneCandidateGate(lane, {
        title: "Tailored biosafety lab training and UVI sensor PoC support for Kihleo",
        description:
          "Danish Life Science Cluster søger via Beyond Beta en leverandør til skræddersyet biosafety lab training og PoC-support med tilbudsfrist 01-07-2099.",
        rawContent:
          "04-06-2099 01-07-2099 14.44 Danish Life Science Cluster Beyond Beta Tailored biosafety lab training and UVI sensor PoC support for Kihleo",
        url: "https://beyondbeta.ehsys.dk/indkoeb/tilbud/indsend/f576aa3a-c671-450f-4f38-08debfdbb015",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "missing software/technical scope" });

    expect(
      laneCandidateGate(lane, {
        title: "100462 Cykelbro Østerbro - Refshaleøen",
        description:
          "Udbud vedrørende rådgivning, projektering og udvikling af brokoncept. Tilbudsfrist 24-07-2099.",
        rawContent:
          "Ordregiver: Københavns Kommune. CPV: 71000000 Arkitekt-, konstruktions-, ingeniør- og inspektionsvirksomhed. Udbud vedrørende rådgivning og udvikling af brokoncept. Tilbudsfrist 24-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=a62bc6d6-f595-4eb3-9808-b6b6788cad7d&noticeVersion=01",
        organization: "Københavns Kommune",
        candidateKind: "opportunity",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toEqual({ allowed: false, reason: "missing software/technical scope" });
  });

  it("blocks job-board spillover from direct startup missions", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "direct-startup-mvp")!;

    expect(
      laneCandidateGate(lane, {
        title: "Founder needs MVP prototype and fullstack technical partner",
        description: "Pre-seed startup wants a product roadmap and prototype sprint this month.",
        organization: "Nordic Founder Studio",
        url: "https://example.com/founder-mvp-build",
      }),
    ).toEqual({ allowed: true });

    expect(
      laneCandidateGate(lane, {
        title: "Rådgivningsforløb om produktstrategi, teknisk roadmap og international skalering af EpiLink",
        description: "Beyond Beta supplier opportunity with active deadline and submission route.",
        url: "https://beyondbeta.ehsys.dk/indkoeb/tilbud/indsend/18f601fe-0dd6-4867-c004-08deb65a1f9f",
        deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
      }),
    ).toEqual({ allowed: true });

    expect(
      laneCandidateGate(lane, {
        title: "Tech & Startup Jobs in Denmark | The Hub, June 2026",
        description: "Full-time, part-time and cofounder startup jobs.",
        url: "https://thehub.io/jobs/location/denmark/copenhagen",
      }),
    ).toEqual({ allowed: false, reason: "job/recruiting result" });

    expect(
      laneCandidateGate(lane, {
        title: "Denmark Startup Jobs on LinkedIn: How to Get Full Stack Developer Job",
        description: "A complete guide to landing a full stack developer job.",
        url: "https://www.linkedin.com/posts/denmark-startup-jobs_how-to-get-full-stack-developer-job",
      }),
    ).toEqual({ allowed: false, reason: "job/recruiting result" });

    expect(
      laneCandidateGate(lane, {
        title: "Toke Lund på LinkedIn: It-startup henter investering på 6,5 mio. kr.",
        description: "Investment announcement with comments and public profile activity.",
        rawContent:
          "Startup-virksomheden Enterspeed har landet en investering på 6,5 mio. kr. fra PreSeed Ventures. Enterspeed er stiftet af tre Novicell-konsulenter og har bygget en SaaS-løsning.",
        url: "https://dk.linkedin.com/posts/toke-lund-007_it-startup-henter-investering-p%C3%A5-65-mio",
      }),
    ).toEqual({ allowed: false, reason: "missing explicit startup opportunity" });

    expect(
      laneCandidateGate(lane, {
        title: "Jens Funder Berg på LinkedIn: Man bliver lidt høj efter en inspirerende dag",
        description: "General conference reflection and network update.",
        url: "https://dk.linkedin.com/posts/jensfunderberg_man-bliver-lidt-hoej",
      }),
    ).toEqual({ allowed: false, reason: "missing explicit startup opportunity" });
  });

  it("filters hot candidate queues through the same lane guard as mission detail", () => {
    const tenderLane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const startupLane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "direct-startup-mvp")!;
    const activeDeadline = new Date(Date.now() + 30 * 86400000).toISOString();

    const visible = filterVisibleLaneCandidates([
      {
        title: "Intranet",
        description: "Udbud om udvikling og drift af intranet. Tilbudsfrist 30-07-2099.",
        rawContent: "Ordregiver: kommune. Softwareudvikling, drift og support. Tilbudsfrist 30-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=2de56b9a-b277-4787-9266-531686ad9731",
        organization: "Kommune",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
        lane: tenderLane,
      },
      {
        title: "Udbud_076502.pdf",
        description: "Arkiveret udbud om software.",
        url: "https://udbud.dk/udbud/arkiv/udbud/76502/vedhaeftning/Udbud_076502.pdf",
        lane: tenderLane,
      },
      {
        title: "Tech & Startup Jobs in Denmark",
        description: "Full-time developer jobs.",
        url: "https://thehub.io/jobs/location/denmark/copenhagen",
        lane: startupLane,
      },
    ]);

    expect(visible.map((candidate) => candidate.title)).toEqual(["Intranet"]);
  });

  it("does not count generic tender platform copy as real tender evidence", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const fit = laneFit(lane, {
      title: "Latest 2026 IT-Software Tenders & Government Contracts",
      description: "Access the latest IT tenders, software tenders, tender alerts, deadlines and procurement buyers.",
      url: "https://tenderimpulse.com/it-software-tenders",
      sourceName: "Tender Impulse",
      applicationRoute: "APPLICATION",
    });

    expect(fit.evidenceMatches).not.toContain("deadline");
    expect(fit.evidenceMatches).not.toContain("submission route");
    expect(fit.evidenceMatches).not.toContain("buyer");
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
