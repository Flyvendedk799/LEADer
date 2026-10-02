import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOUD_CODE_DAILY_BASE_URL } from "@flyvendedk799/ai-auth";

vi.mock("./credentials", () => ({
  antigravityAccountStore: () => ({
    status: async () => ({ connected: true, projectId: null }),
    token: async () => "test-token",
  }),
  claudeAccountStore: () => ({}),
  localClaudeCredential: {},
  localCodexCredential: {},
}));

import { aiConfig, chat } from "./provider";

describe("AGY subscription requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a saved Gemini 3.1 Pro choice to AGY's daily endpoint with its wire model", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        response: { candidates: [{ content: { parts: [{ text: "OK" }] } }] },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const cfg = aiConfig(
      {
        provider: "gemini-subscription",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-3.1-pro",
      },
      "owner-id",
    );

    const answer = await chat([{ role: "user", content: "Reply OK" }], {}, cfg);

    expect(answer).toBe("OK");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${CLOUD_CODE_DAILY_BASE_URL}:generateContent`);
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: "gemini-3.1-pro-low",
      request: { contents: [{ role: "user", parts: [{ text: "Reply OK" }] }] },
    });
  });
});
