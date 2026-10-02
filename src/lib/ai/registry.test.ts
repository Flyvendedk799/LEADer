import { describe, expect, it } from "vitest";
import { modelChoices } from "./registry";

describe("Gemini model choices", () => {
  it("keeps AGY subscription ids separate from Gemini API ids", () => {
    expect(
      modelChoices("gemini-subscription").map((model) => model.id),
    ).toEqual(["gemini-3-flash", "gemini-3.1-pro"]);
    expect(modelChoices("gemini").map((model) => model.id)).toContain(
      "gemini-3.1-pro-preview",
    );
    expect(modelChoices("gemini").map((model) => model.id)).not.toContain(
      "gemini-3.1-pro",
    );
  });
});
