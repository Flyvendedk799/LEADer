import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAUDE_CODE_SYSTEM } from "@flyvendedk799/ai-auth";
import {
  aiConfig,
  chat,
  claudeSubscriptionHeaders,
  claudeSystemBlocks,
  codexResponsesEndpoint,
  isMissingSubscriptionLoginError,
  registryProvider,
  type LlmConfig,
} from "./provider";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function config(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    provider: "anthropic",
    apiKey: "sk-ant-test",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-5",
    source: "user",
    ...overrides,
  };
}

describe("Claude subscription request shape", () => {
  // Trap #4 in ai-auth's README: the Anthropic SDK sends `x-api-key` whenever
  // the header is present, and Anthropic validates it — so a key alongside a
  // valid bearer is rejected rather than ignored.
  it("authenticates with a bearer token and sends no x-api-key", () => {
    const headers = claudeSubscriptionHeaders("access-token-1");

    expect(headers.Authorization).toBe("Bearer access-token-1");
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("x-api-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("presents as the CLI, with the beta flags a real Claude Code session sends", () => {
    const headers = claudeSubscriptionHeaders("access-token-1");

    expect(headers["anthropic-beta"]).toContain("claude-code-20250219");
    expect(headers["anthropic-beta"]).toContain("oauth-2025-04-20");
    expect(headers["user-agent"]).toMatch(/^claude-cli\//);
    expect(headers["x-app"]).toBe("cli");
  });

  // Trap #1: exact text, first position, its own block. Fold it into the prompt
  // or put it second and Anthropic refuses Opus and Sonnet with a 429 naming a
  // limit the plan is nowhere near — while Haiku, the model you would reach for
  // to test a credential, answers fine either way.
  it("opens the system prompt with the Claude Code identity, in its own block", () => {
    const blocks = claudeSystemBlocks("You are LEADer, a lead-intelligence assistant.");

    expect(blocks[0]).toEqual({ type: "text", text: CLAUDE_CODE_SYSTEM });
    expect(blocks[1]?.text).toBe("You are LEADer, a lead-intelligence assistant.");
  });

  it("sends the identity alone rather than an empty block when there is no prompt", () => {
    expect(claudeSystemBlocks("")).toEqual([{ type: "text", text: CLAUDE_CODE_SYSTEM }]);
  });
});

describe("provider identity", () => {
  it("maps both Claude subscription paths onto the registry's billing-based id", () => {
    expect(registryProvider("claude-subscription")).toBe("claude-code");
    expect(registryProvider("claude-account")).toBe("claude-code");
    expect(registryProvider("codex")).toBe("codex");
    expect(registryProvider("openai")).toBe("openai");
    expect(registryProvider("anthropic")).toBe("anthropic");
  });

  it("finds the Codex responses endpoint from either spelling of the base URL", () => {
    const expected = "https://chatgpt.com/backend-api/codex/responses";
    expect(codexResponsesEndpoint("https://chatgpt.com/backend-api")).toBe(expected);
    expect(codexResponsesEndpoint("https://chatgpt.com/backend-api/")).toBe(expected);
    expect(codexResponsesEndpoint("https://chatgpt.com/backend-api/codex")).toBe(expected);
    expect(codexResponsesEndpoint(expected)).toBe(expected);
  });

  it("carries the owner through the config, because a plan belongs to a person", () => {
    expect(aiConfig({ provider: "claude-account" }, "user-1")).toMatchObject({
      provider: "claude-account",
      ownerId: "user-1",
      apiKey: "",
    });
  });
});

describe("provider failures", () => {
  it("says a rate limit is per-model when the plan itself reports as allowed", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('{"type":"error","error":{"type":"rate_limit_error","message":"Error"}}', {
          status: 429,
          headers: {
            "retry-after": "4",
            "anthropic-ratelimit-unified-status": "allowed",
            "anthropic-ratelimit-unified-5h-utilization": "0.19",
          },
        }),
    ) as unknown as typeof fetch;

    await expect(chat([{ role: "user", content: "hi" }], {}, config())).rejects.toThrow(
      /says the plan is still allowed/i,
    );
  });

  it("names the model and where to change it when the model is unknown", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("{}", { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(
      chat([{ role: "user", content: "hi" }], {}, config({ model: "claude-nope" })),
    ).rejects.toThrow(/claude-nope.*Settings → AI provider/s);
  });

  it("keeps the raw status and body when nothing better can be said", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("gateway exploded", { status: 418 }),
    ) as unknown as typeof fetch;

    await expect(chat([{ role: "user", content: "hi" }], {}, config())).rejects.toThrow(
      /Claude request failed \(418\): gateway exploded/,
    );
  });

  it("treats an unconnected account subscription as a missing login, not an error", async () => {
    const error = await chat([{ role: "user", content: "hi" }], {}, config({
      provider: "claude-account",
      apiKey: "",
      ownerId: undefined,
    })).catch((err: unknown) => err);

    expect(isMissingSubscriptionLoginError(error)).toBe(true);
    expect((error as Error).message).toMatch(/no Claude subscription connected/i);
  });
});
