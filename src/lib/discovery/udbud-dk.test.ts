import { describe, expect, it } from "vitest";

import { __discoveryTesting } from ".";

const {
  sanitizeUdbudDkQuery,
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
});
