import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  token: vi.fn(),
  localToken: vi.fn(),
}));

vi.mock("./credentials", () => ({
  hostSecret: () => "test-secret",
  claudeAccountStore: () => ({ status: mocks.status, token: mocks.token }),
  localClaudeCredential: { token: mocks.localToken },
  localCodexCredential: { identity: vi.fn() },
}));

import { ClaudeCodeAuthError, CodexAuthError } from "@flyvendedk799/ai-auth";
import {
  claudeSubscriptionToken,
  codexResponsesEndpoint,
  isMissingSubscriptionLoginError,
} from "./provider";

describe("whose Claude subscription pays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The whole point of the per-user login: on a shared instance the call has to
  // bill the person who asked, not whoever set the server up.
  it("spends the account the user connected here, when there is one", async () => {
    mocks.status.mockResolvedValue({ connected: true });
    mocks.token.mockResolvedValue("account-token");

    expect(await claudeSubscriptionToken("user-1")).toBe("account-token");
    expect(mocks.token).toHaveBeenCalledWith("user-1");
    expect(mocks.localToken).not.toHaveBeenCalled();
  });

  it("falls back to the machine's own claude login when nothing is connected", async () => {
    mocks.status.mockResolvedValue({ connected: false });
    mocks.localToken.mockResolvedValue("machine-token");

    expect(await claudeSubscriptionToken("user-1")).toBe("machine-token");
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("uses the machine login for a caller that names no account", async () => {
    mocks.localToken.mockResolvedValue("machine-token");

    expect(await claudeSubscriptionToken()).toBe("machine-token");
    expect(mocks.status).not.toHaveBeenCalled();
  });

  // A store read that throws must not take the AI feature down when there is a
  // perfectly good login on the machine.
  it("still answers when the credential store is unreachable", async () => {
    mocks.status.mockRejectedValue(new Error("database is down"));
    mocks.localToken.mockResolvedValue("machine-token");

    expect(await claudeSubscriptionToken("user-1")).toBe("machine-token");
  });
});

describe("recognising a missing subscription login", () => {
  // The AI gateway answers this one failure with deterministic mock output
  // rather than a 500, so the classification has to hold across both providers.
  it("classifies the library's own no-login errors", () => {
    expect(isMissingSubscriptionLoginError(new ClaudeCodeAuthError("no login", true))).toBe(true);
    expect(isMissingSubscriptionLoginError(new CodexAuthError("no login", true))).toBe(true);
  });

  it("does not classify a reachable-but-failing provider as missing", () => {
    expect(isMissingSubscriptionLoginError(new ClaudeCodeAuthError("network down", false))).toBe(
      false,
    );
    expect(isMissingSubscriptionLoginError(new Error("HTTP 500"))).toBe(false);
  });
});

describe("codexResponsesEndpoint", () => {
  // Two base URLs are in circulation: the one older settings rows hold, and the
  // library constant that is now the default. Both have to land on one URL.
  it("resolves every base URL shape to the same endpoint", () => {
    const expected = "https://chatgpt.com/backend-api/codex/responses";
    expect(codexResponsesEndpoint("https://chatgpt.com/backend-api")).toBe(expected);
    expect(codexResponsesEndpoint("https://chatgpt.com/backend-api/")).toBe(expected);
    expect(codexResponsesEndpoint("https://chatgpt.com/backend-api/codex")).toBe(expected);
    expect(codexResponsesEndpoint("https://chatgpt.com/backend-api/codex/responses")).toBe(expected);
  });
});
