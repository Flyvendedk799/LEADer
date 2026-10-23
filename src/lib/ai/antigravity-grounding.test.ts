import { describe, expect, it } from "vitest";
import { cleanGroundedText, parseGroundedResults } from "./antigravity";

const body = {
  response: {
    candidates: [
      {
        content: { parts: [{ text: "Acme needs an AI reporting tool. Beta seeks an MVP team." }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "acme.dk" } },
            { web: { uri: "https://beta.dk/mvp", title: "Beta MVP udbud" } },
            { web: { uri: "https://beta.dk/mvp", title: "dup" } },
            { web: {} },
          ],
          groundingSupports: [
            { segment: { text: "Acme needs an AI reporting tool." }, groundingChunkIndices: [0] },
          ],
        },
      },
    ],
  },
};

describe("parseGroundedResults", () => {
  it("returns one result per cited page, with its supported text", () => {
    const out = parseGroundedResults(body, 10);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ snippet: "Acme needs an AI reporting tool." });
    expect(out[0]?.title).toBe("acme.dk — Acme needs an AI reporting tool.");
    expect(out[1]?.title).toBe("Beta MVP udbud");
  });

  it("respects the limit and tolerates a reply with no grounding", () => {
    expect(parseGroundedResults(body, 1)).toHaveLength(1);
    expect(parseGroundedResults({ response: { candidates: [{}] } }, 5)).toEqual([]);
    expect(parseGroundedResults(null, 5)).toEqual([]);
  });
});

describe("cleanGroundedText", () => {
  it("drops markdown, label prefixes and filler sentences", () => {
    expect(cleanGroundedText("**Organisation / Page:** Innovationsfonden (*InnoBooster*)")).toBe(
      "Innovationsfonden (InnoBooster)",
    );
    expect(cleanGroundedText("**What they offer:** An IT consultancy")).toBe("An IT consultancy");
    expect(cleanGroundedText("Listing / Page: Managed Engineering")).toBe("Managed Engineering");
    expect(cleanGroundedText("Platform: Upwork Hvad de søger/tilbyder: Founder søger en udvikler")).toBe(
      "Upwork Founder søger en udvikler",
    );
    expect(cleanGroundedText("The web search returns several relevant results")).toBe("");
  });
});
