import { describe, expect, it } from "vitest";
import { LOCAL_EMBED_MODEL, cosineSimilarity, embed, localEmbed, opportunityEmbedText } from "./embeddings";

describe("localEmbed", () => {
  it("is deterministic and L2-normalised", () => {
    const a = localEmbed("fullstack MVP for an AI startup");
    const b = localEmbed("fullstack MVP for an AI startup");
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("produces a fixed-dimension vector", () => {
    expect(localEmbed("anything")).toHaveLength(256);
    expect(localEmbed("")).toHaveLength(256);
  });
});

describe("cosineSimilarity", () => {
  it("ranks related text above unrelated text", () => {
    const target = localEmbed("AI MVP development for a funded startup, fullstack Next.js");
    const similar = localEmbed("Fullstack developer to build an AI MVP for a startup");
    const different = localEmbed("Hardware manufacturing tender for industrial machinery parts");
    const simScore = cosineSimilarity(target, similar);
    const diffScore = cosineSimilarity(target, different);
    expect(simScore).toBeGreaterThan(diffScore);
    expect(simScore).toBeGreaterThan(0.1);
  });

  it("returns 1 for identical vectors and handles mismatched lengths", () => {
    const v = localEmbed("identical text here");
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("embed (offline fallback)", () => {
  it("uses the local model when no LLM key is configured", async () => {
    const prev = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    try {
      const { vector, model } = await embed("offline embedding test");
      expect(model).toBe(LOCAL_EMBED_MODEL);
      expect(vector).toHaveLength(256);
    } finally {
      if (prev) process.env.LLM_API_KEY = prev;
    }
  });
});

describe("opportunityEmbedText", () => {
  it("joins the salient fields and skips empties", () => {
    const text = opportunityEmbedText({ title: "T", description: "D", organization: null, category: "C", rawContent: null });
    expect(text).toContain("T");
    expect(text).toContain("C");
    expect(text).toContain("D");
  });
});
