import { describe, expect, it } from "vitest";

import { __discoveryTesting } from ".";

const {
  filterTenderSearchResults,
  sanitizeUdbudDkQuery,
  shouldUseDeterministicDiscoverySummary,
  udbudDkResultToCandidate,
  udbudDkSearchSeeds,
} = __discoveryTesting;

describe("udbud.dk discovery source", () => {
  it("sanitizes lane probes into udbud.dk full-text searches", () => {
    expect(
      sanitizeUdbudDkQuery(
        "site:udbud.dk/detaljevisning software udvikling drift support tilbudsfrist",
      ),
    ).toBe("software udvikling drift support");

    expect(
      udbudDkSearchSeeds("site:mercell.com/da-dk/udbud software udvikling udbud", []),
    ).toContain("software udvikling");
    expect(
      udbudDkSearchSeeds("site:mercell.com/da-dk/udbud software udvikling udbud", []),
    ).toContain("software");
  });

  it("prefilters generic, archive, and job-style web results before tender enrichment", () => {
    const result = filterTenderSearchResults([
      {
        title: "Dennis på LinkedIn: software udbud og udviklerjob",
        url: "https://dk.linkedin.com/posts/dennis-software-udbud",
        snippet: "LinkedIn activity about startup jobs and software.",
        sourceName: "LinkedIn",
        provider: "brave",
        query: "software udbud",
      },
      {
        title: "Tech & Startup Jobs in Denmark | The Hub",
        url: "https://thehub.io/jobs/location/denmark/copenhagen",
        snippet: "Full-time and cofounder startup jobs.",
        sourceName: "The Hub",
        provider: "brave",
        query: "software udbud",
      },
      {
        title: "Udbud.co software tender archive",
        url: "https://udbud.co/archive/software",
        snippet: "Browse archived public tenders.",
        sourceName: "Udbud.co",
        provider: "brave",
        query: "software udbud",
      },
      {
        title: "udbud.dk",
        url: "https://udbud.dk/Pages/Tenders/ShowTender?tenderid=61801",
        snippet: "Old udbud.dk tender page.",
        sourceName: "Udbud",
        provider: "brave",
        query: "software udbud",
      },
      {
        title: "Latest 2026 IT-Software Tenders & Government Contracts",
        url: "https://tenderimpulse.com/it-software-tenders",
        snippet: "A tender portal and database of IT tenders with alerts.",
        sourceName: "Tender Impulse",
        provider: "brave",
        query: "software udbud",
      },
      {
        title: "Godkendte rådgivere på SMV:Digital og SMV:PRO",
        url: "https://www.teknologisk.dk/ydelser/smv-digital-og-smv-pro/44758",
        snippet: "Voucher and grant programme advisers for digitalization projects.",
        sourceName: "Teknologisk",
        provider: "brave",
        query: "software udbud",
      },
      {
        title: "Kontrakt om levering af drift og support af hostet servermiljø",
        url: "https://udbud.dk/detaljevisning?noticeId=32f47e2a-3bff-4727-a49e-f68f3729982c&noticeVersion=01",
        snippet: "Aktivt offentligt udbud om software, drift og support.",
        sourceName: "udbud.dk",
        provider: "brave",
        query: "software udbud",
      },
      {
        title: "Konkret softwareudbud for supportaftale",
        url: "https://example.dk/tenders/software-support-2026/",
        snippet: "Concrete tender page with buyer, scope and active deadline.",
        sourceName: "Example procurement",
        provider: "brave",
        query: "software udbud",
      },
    ]);

    expect(result.results.map((item) => item.title)).toEqual([
      "Kontrakt om levering af drift og support af hostet servermiljø",
      "Konkret softwareudbud for supportaftale",
    ]);
    expect(result.removed).toBe(6);
    expect(result.reasons).toEqual([
      "2 job/social result",
      "1 archived tender URL",
      "1 legacy udbud.dk archive URL",
      "1 generic tender source, not a concrete opportunity",
      "1 missing tender evidence",
    ]);
  });

  it("maps active udbud.dk search results to concrete tender candidates", () => {
    const deadline = new Date(Date.now() + 90 * 86400000).toISOString();
    const candidate = udbudDkResultToCandidate(
      {
        noticeId: "3e7ca982-c07b-421e-ae75-c771014a708a",
        noticeVersion: "01",
        noticePublicationNumber: "00403929-2099",
        dataDa: {
          titel: "Udbud med forhandling vedr. levering, implementering og udvikling af IT-løsning",
          ordregiver: "Social- og Boligstyrelsen",
          publiceringsdato: "18-06-2099",
          cpvKode: "72000000",
          cpvTitel: "It-tjenester: rådgivning, programmeludvikling, internet og support",
          tidsfrister: [deadline],
          anslaaetVaerdiValuta: "DKK",
          beskrivelse:
            "Kontrakt vedrørende levering, implementering, vedligeholdelse, support og udvikling af en IT-løsning.",
          bkSubType: "Udbudsbekendtgørelse",
        },
      },
      "software udvikling",
    );

    expect(candidate).toMatchObject({
      title: "Udbud med forhandling vedr. levering, implementering og udvikling af IT-løsning",
      organization: "Social- og Boligstyrelsen",
      country: "DK",
      category: "Tender",
      applicationRoute: "APPLICATION",
    });
    expect(candidate?.deadline?.toISOString()).toBe(deadline);
    expect(candidate?.url).toContain("noticeId=3e7ca982-c07b-421e-ae75-c771014a708a");
    expect(candidate?.rawContent).toContain("CPV: 72000000");
  });

  it("keeps official udbud.dk notices on deterministic summaries", () => {
    expect(
      shouldUseDeterministicDiscoverySummary({
        sourceName: "udbud.dk",
        provider: "udbud.dk",
      }),
    ).toBe(true);
    expect(
      shouldUseDeterministicDiscoverySummary({
        sourceName: "Brave",
        provider: "brave",
      }),
    ).toBe(false);
  });

  it("drops decade-long DIS/catalogue notices from the official source", () => {
    expect(
      udbudDkResultToCandidate(
        {
          noticeId: "94ef2048-9a7b-4179-8d97-c179940adfa8",
          noticeVersion: "01",
          noticePublicationNumber: "00413602-2024",
          dataDa: {
            titel: "02.14 It-konsulenter (DIS)",
            ordregiver: "Statens og Kommunernes Indkøbsservice",
            publiceringsdato: "01-06-2026",
            cpvKode: "72000000",
            cpvTitel: "It-tjenester",
            tidsfrister: ["2049-08-26T11:00:00Z"],
            beskrivelse: "Dynamisk indkøbssystem for it-konsulenter.",
          },
        },
        "it konsulent",
      ),
    ).toBeNull();
  });

  it("drops broad framework agreements from the official source", () => {
    const deadline = new Date(Date.now() + 30 * 86400000).toISOString();

    expect(
      udbudDkResultToCandidate(
        {
          noticeId: "168a4125-b619-4401-b2a2-05ba7e218da3",
          noticeVersion: "01",
          noticePublicationNumber: "00370564-2099",
          dataDa: {
            titel: "Udbud af rammeaftale om levering af IT-konsulentydelser inden for GIS",
            ordregiver: "Andel Holding A/S",
            publiceringsdato: "01-06-2099",
            cpvKode: "72260000",
            cpvTitel: "Programmelrelaterede tjenester",
            tidsfrister: [deadline],
            beskrivelse: "Rammeaftale om levering af IT-konsulentydelser inden for GIS til flere fremtidige projekter.",
            bkSubType: "Udbudsbekendtgørelse",
          },
        },
        "software udvikling",
      ),
    ).toBeNull();
  });

  it("drops official notices without concrete software scope", () => {
    const deadline = new Date(Date.now() + 30 * 86400000).toISOString();

    expect(
      udbudDkResultToCandidate(
        {
          noticeId: "3025d5d3-08f1-40bd-a54d-bd17344f1693",
          noticeVersion: "01",
          noticePublicationNumber: "00368106-2099",
          dataDa: {
            titel: "EEA/CCE/TC/26/004 - Topic Centre on Sustainability and Decarbonisation of EU's Transport Sector",
            ordregiver: "European Environment Agency (EEA)",
            publiceringsdato: "01-06-2099",
            cpvKode: "73000000",
            cpvTitel: "Forsknings- og udviklingsvirksomhed og hermed beslægtet konsulentvirksomhed",
            tidsfrister: [deadline],
            beskrivelse:
              "Topic Centre support for collecting, compiling, quality checking, verifying reported data and maintaining procedures under Regulation (EU) for the transport sector. Support with reporting dataflows, database structure, and software maintenance of the COPERT emissions model.",
            bkSubType: "Udbudsbekendtgørelse",
          },
        },
        "software",
      ),
    ).toBeNull();

    expect(
      udbudDkResultToCandidate(
        {
          noticeId: "a62bc6d6-f595-4eb3-9808-b6b6788cad7d",
          noticeVersion: "01",
          noticePublicationNumber: "00351588-2099",
          dataDa: {
            titel: "100462 Cykelbro Østerbro - Refshaleøen",
            ordregiver: "Københavns Kommune",
            publiceringsdato: "01-06-2099",
            cpvKode: "71000000",
            cpvTitel: "Arkitekt-, konstruktions-, ingeniør- og inspektionsvirksomhed",
            tidsfrister: [deadline],
            beskrivelse: "Udbud vedrørende rådgivning, projektering og udvikling af brokoncept.",
            bkSubType: "Udbudsbekendtgørelse",
          },
        },
        "software",
      ),
    ).toBeNull();
  });
});
