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
