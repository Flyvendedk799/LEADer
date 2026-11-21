import { describe, expect, it } from "vitest";
import { extractBudget, parseAmount } from "./extract";

const max = (text: string) => extractBudget(text).max;

describe("budget extraction", () => {
  it("never reads bare counts as prices (regression: 6.000 dyrlæger → 6000 DKK)", () => {
    const vet =
      "Hvert år udstedes der ca. 1,1 mio. recepter til dyr. Danmark har i alt omkring 6.000 dyrlæger med autorisation, hvoraf ca. 2.650 er aktive dyrlæger fordelt på ca. 1.000 dyrlægepraksis.";
    expect(max(vet)).toBeUndefined();
    expect(max("Systemet har 25.000 brugere og 1.200 ansatte")).toBeUndefined();
  });

  it("reads millions in every common form", () => {
    expect(max("Kontraktens anslåede værdi er 11,6 mio. kr. ekskl. moms")).toBe(11_600_000);
    expect(max("Estimated value: DKK 11.6 million")).toBe(11_600_000);
    expect(max("Budget: 11.6m DKK")).toBe(11_600_000);
    expect(max("Værdi 4,5 millioner DKK ekskl. moms")).toBe(4_500_000);
    expect(max("Total value €1.2m")).toBe(1_200_000);
    expect(max("Anslået værdi: 19.600.000 DKK")).toBe(19_600_000);
    expect(max("ca. 250 t. kr.")).toBe(250_000);
  });

  it("prefers the labelled contract value over smaller amounts", () => {
    const text = "Option på support for 2 mio. kr. Den samlede kontraktværdi er 11,6 mio. kr. Licenser 600.000 kr.";
    expect(max(text)).toBe(11_600_000);
    expect(max("Timepris 850 kr. Budget: 400.000 kr.")).toBe(400_000);
  });

  it("keeps a rate when there is no project amount", () => {
    expect(max("Timepris: 850 kr/time")).toBe(850);
    expect(max("Rate: 95 EUR per hour, remote")).toBe(95);
  });

  it("handles ranges, currencies and number formats", () => {
    expect(extractBudget("50.000 - 100.000 kr")).toMatchObject({ min: 50_000, max: 100_000, currency: "DKK" });
    expect(extractBudget("Budget: 4-6 mio. kr.")).toMatchObject({ min: 4_000_000, max: 6_000_000 });
    expect(extractBudget("Budget €40,000 to €60,000")).toMatchObject({ min: 40_000, max: 60_000, currency: "EUR" });
    expect(extractBudget("Pris: 75.000,- ekskl. moms")).toMatchObject({ max: 75_000, currency: "DKK" });
    expect(extractBudget("Pay: $3,500 fixed price")).toMatchObject({ max: 3_500, currency: "USD" });
    expect(parseAmount("1.100.000,50")).toBe(1_100_000.5);
    expect(parseAmount("4 000 000")).toBe(4_000_000);
  });

  it("does not take years, percentages or overflowing values", () => {
    expect(max("Budget 2026 til 2027")).toBeUndefined();
    expect(max("Tilskud op til 50 % af budgettet")).toBeUndefined();
    expect(max("Samlet værdi 5 mia. kr.")).toBeUndefined(); // above the 32-bit column
  });

  it("returns a quote for evidence", () => {
    expect(extractBudget("Lots of text. Anslået værdi: 4 mio. kr. More text.").quote).toContain("4 mio. kr.");
  });
});
