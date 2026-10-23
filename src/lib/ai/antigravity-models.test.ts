import { describe, expect, it } from "vitest";
import { parseAvailableModels } from "./antigravity";

describe("parseAvailableModels", () => {
  it("keeps Gemini chat models and drops image, embedding and agent entries", () => {
    const models = parseAvailableModels({
      models: {
        "gemini-3.8-flash-tiered": { displayName: "Gemini 3.8 Flash" },
        "gemini-3.1-pro-low": {},
        "gemini-3-pro-image": { displayName: "Image" },
        "gemini-embedding-001": {},
        "gemini-4-argon-agent": {},
        "claude-sonnet-5": { displayName: "Claude" },
      },
    });
    expect(models).toEqual([
      { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
      { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
      { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
      { id: "gemini-3.1-pro-low", label: "gemini-3.1-pro-low" },
    ]);
  });

  it("tolerates a missing models map", () => {
    expect(parseAvailableModels({})).toEqual([]);
    expect(parseAvailableModels(null)).toEqual([]);
  });
});
