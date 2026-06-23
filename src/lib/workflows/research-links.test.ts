import { describe, expect, it } from "vitest";

import { researchSearchHref, uniqueResearchPrompts } from "./research-links";

describe("research prompt links", () => {
  it("turns Danish quoted prompts into web search links", () => {
    expect(researchSearchHref('"Mette Jensen" CVR telefon')).toBe(
      "https://www.google.com/search?q=%22Mette%20Jensen%22%20CVR%20telefon",
    );
  });

  it("dedupes and trims prompt chips", () => {
    expect(uniqueResearchPrompts(["  Mette Jensen kontakt ", "mette jensen kontakt", null, "Mette Jensen LinkedIn"], 3))
      .toEqual(["Mette Jensen kontakt", "Mette Jensen LinkedIn"]);
  });
});
