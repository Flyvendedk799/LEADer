import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildStoredAiKeys,
  getStoredApiKey,
  normalizeStoredAiKeys,
  publicAiKeys,
} from "./keys";
import { aiConfig, hasLlm } from "./provider";

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
      model: "claude-sonnet-5",
      apiKey: "sk-ant-test-123456",
    });

    expect(stored.encryptedApiKey).toBeTruthy();
    expect(stored.encryptedApiKey).not.toContain("sk-ant-test");
    expect(getStoredApiKey(stored)).toBe("sk-ant-test-123456");

    const safe = publicAiKeys(stored);
    expect(safe?.provider).toBe("anthropic");
    expect(safe?.hasApiKey).toBe(true);
    expect(safe?.keyPreview).toBe("sk-ant-…3456");
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
    expect(sameProvider.keyPreview).toBe("sk-open…cdef");

    const switchedProvider = buildStoredAiKeys(
      { provider: "anthropic", model: "claude-sonnet-5" },
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

  it("stores subscription providers without API keys and treats them as live-capable", () => {
    const stored = buildStoredAiKeys({
      provider: "codex",
      model: "gpt-5",
      apiKey: "should-not-be-stored",
    });

    expect(stored.provider).toBe("codex");
    expect(stored.encryptedApiKey).toBeUndefined();
    expect(stored.keyPreview).toBeUndefined();
    expect(publicAiKeys(stored)?.hasApiKey).toBe(false);

    const cfg = aiConfig(stored);
    expect(cfg.provider).toBe("codex");
    expect(cfg.apiKey).toBe("");
    expect(cfg.baseUrl).toBe("https://chatgpt.com/backend-api/codex");
    expect(hasLlm(stored)).toBe(true);
  });

  it("clears API-key metadata when switching to a subscription provider", () => {
    const stored = buildStoredAiKeys({
      provider: "openai",
      apiKey: "sk-openai-test-abcdef",
    });

    const switched = buildStoredAiKeys({ provider: "claude-subscription" }, stored);

    expect(switched.provider).toBe("claude-subscription");
    expect(switched.encryptedApiKey).toBeUndefined();
    expect(switched.keyPreview).toBeUndefined();
  });
});

describe("adopting ai-auth over keys LEADer already wrote", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AI_KEYS_ENCRYPTION_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  /** Exactly what the pre-library code wrote: sha256(secret), four base64url parts. */
  function legacyEncrypt(apiKey: string, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
    const body = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      body.toString("base64url"),
    ].join(":");
  }

  it("still reads a key stored in the old format", () => {
    const stored = normalizeStoredAiKeys({
      provider: "openai",
      encryptedApiKey: legacyEncrypt("sk-legacy-key-1234", "test-secret"),
    });

    expect(getStoredApiKey(stored)).toBe("sk-legacy-key-1234");
  });

  it("re-seals a legacy key in the new format when settings are saved again", () => {
    const legacy = buildStoredAiKeys({ provider: "openai", apiKey: "sk-legacy-key-1234" });
    legacy.encryptedApiKey = legacyEncrypt("sk-legacy-key-1234", "test-secret");

    const resaved = buildStoredAiKeys({ provider: "openai", apiKey: "sk-fresh-key-5678" }, legacy);

    expect(resaved.encryptedApiKey?.startsWith("v1:")).toBe(false);
    expect(getStoredApiKey(resaved)).toBe("sk-fresh-key-5678");
  });

  // GCM, so a wrong key fails to open rather than decrypting to garbage some
  // parser downstream then has to survive.
  it("degrades to unconfigured under a rotated host secret, rather than 500ing", () => {
    const stored = buildStoredAiKeys({ provider: "openai", apiKey: "sk-openai-test-abcdef" });
    expect(getStoredApiKey(stored)).toBe("sk-openai-test-abcdef");

    process.env.AI_KEYS_ENCRYPTION_SECRET = "a-different-secret";

    expect(getStoredApiKey(stored)).toBe("");
    expect(hasLlm(stored)).toBe(false);
    // Which is the mock-output path, not an exception on every AI route.
    expect(aiConfig(stored).apiKey).toBe("");
  });
});
