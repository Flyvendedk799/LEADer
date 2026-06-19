import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildStoredAiKeys,
  getStoredApiKey,
  normalizeStoredAiKeys,
  publicAiKeys,
} from "./keys";
import { aiConfig } from "./provider";

describe("AI key storage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AI_KEYS_ENCRYPTION_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("encrypts stored keys and only exposes masked public metadata", () => {
    const stored = buildStoredAiKeys({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-3-5-sonnet-latest",
      apiKey: "sk-ant-test-123456",
    });

    expect(stored.encryptedApiKey).toBeTruthy();
    expect(stored.encryptedApiKey).not.toContain("sk-ant-test");
    expect(getStoredApiKey(stored)).toBe("sk-ant-test-123456");

    const safe = publicAiKeys(stored);
    expect(safe?.provider).toBe("anthropic");
    expect(safe?.hasApiKey).toBe(true);
    expect(safe?.keyPreview).toBe("****3456");
    expect(JSON.stringify(safe)).not.toContain("sk-ant-test");
  });

  it("preserves a saved key for the same provider and clears it when providers change", () => {
    const stored = buildStoredAiKeys({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-openai-test-abcdef",
    });

    const sameProvider = buildStoredAiKeys({ provider: "openai", model: "gpt-4.1-mini" }, stored);
    expect(getStoredApiKey(sameProvider)).toBe("sk-openai-test-abcdef");
    expect(sameProvider.keyPreview).toBe("****cdef");

    const switchedProvider = buildStoredAiKeys(
      { provider: "anthropic", model: "claude-3-5-sonnet-latest" },
      stored,
    );
    expect(switchedProvider.encryptedApiKey).toBeUndefined();
    expect(switchedProvider.keyPreview).toBeUndefined();
  });

  it("normalizes legacy openai-compatible config and resolves user config before env", () => {
    process.env.LLM_API_KEY = "env-key";
    process.env.LLM_MODEL = "env-model";
    const stored = buildStoredAiKeys({
      provider: "openai-compatible",
      model: "gpt-4o-mini",
      apiKey: "user-key",
    });

    expect(normalizeStoredAiKeys(stored)?.provider).toBe("openai");
    const cfg = aiConfig(stored);
    expect(cfg.source).toBe("user");
    expect(cfg.provider).toBe("openai");
    expect(cfg.apiKey).toBe("user-key");
    expect(cfg.model).toBe("gpt-4o-mini");
  });
});
