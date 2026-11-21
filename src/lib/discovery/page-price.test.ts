import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { structuredPagePrice } from "./index";

describe("structured page prices", () => {
  it("reads JobPosting salary and Offer prices from JSON-LD", () => {
    const $ = cheerio.load(`<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      baseSalary: { "@type": "MonetaryAmount", currency: "DKK", value: { "@type": "QuantitativeValue", minValue: 750, maxValue: 900, unitText: "HOUR" } },
    })}</script>`);
    expect(structuredPagePrice($)).toMatchObject({ min: 750, max: 900, currency: "DKK", source: "structured" });
  });

  it("reads price meta tags", () => {
    const $ = cheerio.load(`<meta property="product:price:amount" content="45000"><meta property="product:price:currency" content="DKK">`);
    expect(structuredPagePrice($)).toMatchObject({ max: 45000, currency: "DKK" });
  });

  it("ignores pages without priced data", () => {
    expect(structuredPagePrice(cheerio.load(`<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>`))).toBeNull();
  });
});
