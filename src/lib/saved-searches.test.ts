import { describe, expect, it } from "vitest";

import { describeSavedSearchFilters, savedSearchFiltersToHref } from "./saved-searches";

describe("saved search helpers", () => {
  it("serializes stored filters into an opportunities href", () => {
    expect(
      savedSearchFiltersToHref({
        q: "ai automation",
        status: ["NEW", "WATCH"],
        activeOnly: true,
        scoreMin: 70,
        sort: "deadline",
        order: "asc",
      }),
    ).toBe("/opportunities?q=ai+automation&status=NEW%2CWATCH&activeOnly=true&scoreMin=70&sort=deadline&order=asc");
  });

  it("normalizes repeated raw query values saved by the filter rail", () => {
    expect(
      savedSearchFiltersToHref({
        status: ["NEW,WATCH", "INTERESTING"],
        source: ["source-a", "source-b"],
        page: "2",
      }),
    ).toBe("/opportunities?status=NEW%2CWATCH%2CINTERESTING&source=source-a%2Csource-b&page=2");
  });

  it("describes the important saved filters", () => {
    expect(
      describeSavedSearchFilters({
        q: "udbud",
        workspace: "DK",
        status: "NEW,WATCH",
        scoreMin: "60",
        activeOnly: "true",
      }),
    ).toBe("\"udbud\" - DK - NEW, WATCH - score >= 60 - active only");
  });
});
