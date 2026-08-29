import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "@flyvendedk799/ai-auth";
import {
  ClaudeLoginRequestError,
  beginClaudeLogin,
  claudeAccountToken,
  claudeConnection,
  completeClaudeLogin,
  disconnectClaudeAccount,
} from "./claude-account";

// The browser login, end to end, with the Anthropic exchange stubbed. The
// interesting behaviour is all in what the server keeps and for how long: the
// PKCE verifier never leaves it, the state check refuses somebody else's code,
// and a spent login cannot be replayed.

const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      access_token: "access-token-1",
      refresh_token: "refresh-token-1",
      expires_in: 3600,
      scope: "user:inference user:profile",
      account: { subscription_type: "max" },
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function stateOf(url: string): string {
  const state = new URL(url).searchParams.get("state");
  if (!state) throw new Error("authorize url carried no state");
  return state;
}

describe("per-account Claude subscription", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let store: MemoryCredentialStore;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://leader:leader@localhost:5432/leader";
    process.env.AI_KEYS_ENCRYPTION_SECRET = "test-secret";
    store = new MemoryCredentialStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("keeps the verifier on the server and sends only the authorize URL out", async () => {
    const started = await beginClaudeLogin("user-1", { store });

    expect(started.url).toContain("https://platform.claude.com/oauth/authorize");
    expect(new URL(started.url).searchParams.get("code_challenge_method")).toBe("S256");
    expect(started.expiresInSeconds).toBe(600);
    expect(JSON.stringify(started)).not.toContain("code_verifier");

    // Sealed at rest: the pending row is not readable as the verifier it holds.
    const pending = await store.read("leader:pending-claude:user-1");
    expect(pending?.payload).toBeTruthy();
    expect(pending?.payload).not.toContain("verifier");
  });

  it("connects the account when the pasted code carries the matching state", async () => {
    const started = await beginClaudeLogin("user-1", { store });
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(url).toBe(TOKEN_URL);
      return tokenResponse();
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const connection = await completeClaudeLogin("user-1", `auth-code-1#${stateOf(started.url)}`, {
      store,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(connection).toMatchObject({ connected: true, plan: "max", available: true });
    expect(await claudeAccountToken("user-1", { store })).toBe("access-token-1");

    const status = await claudeConnection("user-1", { store });
    expect(status.connected).toBe(true);
    expect(status.scopes).toContain("user:inference");
  });

  it("stores the credential sealed, not as a readable token", async () => {
    const started = await beginClaudeLogin("user-1", { store });
    globalThis.fetch = vi.fn(async () => tokenResponse()) as unknown as typeof fetch;
    await completeClaudeLogin("user-1", `auth-code-1#${stateOf(started.url)}`, { store });

    const record = await store.read("leader:claude:user-1");
    expect(record?.payload).not.toContain("access-token-1");
    expect(record?.payload).not.toContain("refresh-token-1");
    // Plan and expiry sit beside the payload, so a status page costs no decryption.
    expect(record?.meta.plan).toBe("max");
  });

  it("refuses a code from a different login and keeps the started one usable", async () => {
    const started = await beginClaudeLogin("user-1", { store });
    const fetchMock = vi.fn(async () => tokenResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      completeClaudeLogin("user-1", "auth-code-1#someone-elses-state", { store }),
    ).rejects.toMatchObject({ code: "state_mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();

    // A mispaste costs a retry, not the whole login.
    await expect(
      completeClaudeLogin("user-1", `auth-code-1#${stateOf(started.url)}`, { store }),
    ).resolves.toMatchObject({ connected: true });
  });

  it("spends a login exactly once", async () => {
    const started = await beginClaudeLogin("user-1", { store });
    globalThis.fetch = vi.fn(async () => tokenResponse()) as unknown as typeof fetch;
    const code = `auth-code-1#${stateOf(started.url)}`;

    await completeClaudeLogin("user-1", code, { store });
    await expect(completeClaudeLogin("user-1", code, { store })).rejects.toMatchObject({
      code: "no_pending_login",
    });
  });

  it("expires a login that was never finished", async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const started = await beginClaudeLogin("user-1", { store, now });
    clock += 11 * 60 * 1000;

    await expect(
      completeClaudeLogin("user-1", `auth-code-1#${stateOf(started.url)}`, { store, now }),
    ).rejects.toMatchObject({ code: "no_pending_login" });
    expect(await store.read("leader:pending-claude:user-1")).toBeNull();
  });

  it("rejects a code that is not a string or is implausibly long", async () => {
    await beginClaudeLogin("user-1", { store });

    await expect(completeClaudeLogin("user-1", undefined, { store })).rejects.toBeInstanceOf(
      ClaudeLoginRequestError,
    );
    await expect(completeClaudeLogin("user-1", "x".repeat(4096), { store })).rejects.toMatchObject({
      code: "bad_code",
    });
  });

  it("surfaces a rejected code as a restartable login rather than a 500", async () => {
    const started = await beginClaudeLogin("user-1", { store });
    globalThis.fetch = vi.fn(
      async () => new Response("{}", { status: 400 }),
    ) as unknown as typeof fetch;

    await expect(
      completeClaudeLogin("user-1", `auth-code-1#${stateOf(started.url)}`, { store }),
    ).rejects.toMatchObject({ code: "exchange_failed", restart: true, status: 400 });
  });

  it("disconnects, and reports an account that never connected as disconnected", async () => {
    expect(await claudeConnection("user-2", { store })).toMatchObject({
      connected: false,
      available: true,
    });

    const started = await beginClaudeLogin("user-1", { store });
    globalThis.fetch = vi.fn(async () => tokenResponse()) as unknown as typeof fetch;
    await completeClaudeLogin("user-1", `auth-code-1#${stateOf(started.url)}`, { store });

    expect(await disconnectClaudeAccount("user-1", { store })).toMatchObject({ connected: false });
    expect(await claudeConnection("user-1", { store })).toMatchObject({ connected: false });
  });

  it("says so honestly when the deployment has nowhere to keep a credential", async () => {
    delete process.env.DATABASE_URL;

    expect(await claudeConnection("user-1", { store })).toMatchObject({
      connected: false,
      available: false,
    });
    await expect(beginClaudeLogin("user-1", { store })).rejects.toMatchObject({
      code: "no_store",
      status: 503,
    });
  });
});
