import { describe, expect, it } from "vitest";
import { modelChoices } from "./registry";

describe("Gemini model choices", () => {
  it("keeps AGY subscription ids separate from Gemini API ids", () => {
    const agy = modelChoices("gemini-subscription").map((model) => model.id);
    expect(agy).toContain("gemini-3.8-flash-high");
    expect(agy).not.toContain("gemini-3.1-pro-preview");
    expect(modelChoices("gemini").map((model) => model.id)).toContain(
      "gemini-3.1-pro-preview",
    );
    expect(modelChoices("gemini").map((model) => model.id)).not.toContain(
      "gemini-3.1-pro",
    );
  });
});
