import { describe, expect, it } from "vitest";
import {
  hasConcreteSoftwareTenderScope,
  isBroadFrameworkTender,
} from "./tender-quality";
describe("tender relevance", () => {
  it("rejects hardware tenders whose classification says except software", () => {
    expect(
      hasConcreteSoftwareTenderScope(
        "Udbud af ladestandere. CPV: 51000000 Installationstjenester (undtagen programmel)",
      ),
    ).toBe(false);
    expect(
      hasConcreteSoftwareTenderScope(
        "Levering af kaldeanlæg med udstyr, software, integrationer og service",
      ),
    ).toBe(false);
    expect(
      hasConcreteSoftwareTenderScope("Kapitalforvaltning og rådgivning"),
    ).toBe(false);
  });
  it("keeps concrete software delivery and rejects broad consultancy frameworks", () => {
    expect(
      hasConcreteSoftwareTenderScope(
        "Udvikling af et webapp til digital rapportering",
      ),
    ).toBe(true);
    expect(
      isBroadFrameworkTender(
        "Provision of consultancy services. The framework service contracts support Copernicus.",
      ),
    ).toBe(true);
  });
});

describe("IT notices under the generic IT-services CPV", () => {
  const withCpv = (title: string, description: string) =>
    // Production text is whitespace-collapsed (cleanText) before the scope check.
    `${title} Ordregiver: X CPV: 72000000 It-tjenester: rådgivning, programmeludvikling, internet og support Formulartype: Konkurrencevilkår ${description}`;

  it("keeps real IT systems whose wording the keyword list does not know", () => {
    for (const [title, description] of [
      ["Digital Asset Management", "Delivery and implementation of a DAM solution. The platform shall consolidate digital assets."],
      ["Development of financial IT", "Development, Implementation, Maintenance and Operation of Financial IT Systems (DIMOS VII)."],
      ["Udbud af WMS", "Region udbyder en kontrakt vedrørende Warehouse Management System (WMS)."],
      ["Drift af Statens Budgetsystem", "Udbud af kontrakten om drift, vedligehold, support og videreudvikling af Statens Budgetsystem (SBS)."],
    ]) {
      expect(hasConcreteSoftwareTenderScope(withCpv(title, description))).toBe(true);
    }
  });

  it("still rejects generic-CPV notices with no system or platform in them", () => {
    expect(
      hasConcreteSoftwareTenderScope(withCpv("Konsulentbistand", "Rådgivning om organisationsudvikling og ledelse.")),
    ).toBe(false);
  });
});
