import { describe, expect, it } from "vitest";
import { tedNoticeValue, tedPublicationNumber } from "./ted";

describe("TED values", () => {
  it("normalises udbud.dk publication numbers", () => {
    expect(tedPublicationNumber("00767356-2026")).toBe("767356-2026");
    expect(tedPublicationNumber("")).toBeNull();
    expect(tedPublicationNumber("abc")).toBeNull();
  });

  it("uses the overall value, else sums the lots", () => {
    expect(tedNoticeValue({ "estimated-value-lot": ["900000000"], "estimated-value-cur-lot": ["DKK"] })).toEqual({ value: 900_000_000, currency: "DKK" });
    expect(tedNoticeValue({ "estimated-value-lot": ["2000000", "1500000"], "estimated-value-cur-lot": ["DKK", "DKK"] })).toEqual({ value: 3_500_000, currency: "DKK" });
    expect(tedNoticeValue({ "estimated-value-glo": ["5000000"], "estimated-value-cur-glo": ["EUR"], "estimated-value-lot": ["1"] })).toEqual({ value: 5_000_000, currency: "EUR" });
    expect(tedNoticeValue({})).toBeNull();
    expect(tedNoticeValue({ "estimated-value-glo": ["9000000000"] })).toBeNull();
  });
});
