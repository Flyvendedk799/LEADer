import {
  ClaudeLoginError,
  SecretBox,
  exchangeClaudeCode,
  parsePastedCode,
  sameState,
  startClaudeLogin,
  type ClaudeAccountStatus,
  type CredentialStore,
} from "@flyvendedk799/ai-auth";
import { aiHostSecret, claudeAccountStore, credentialStore, credentialStoreAvailable } from "./credential-store";

// ─────────────────────────────────────────────────────────────────────────
// Connecting a LEADer user's own Claude subscription.
//
// This is @flyvendedk799/ai-auth's browser login. The library ships it as a
// Fastify plugin; LEADer is Next.js, so the four routes are re-implemented on
// top of the same primitives (`startClaudeLogin`, `parsePastedCode`,
// `sameState`, `exchangeClaudeCode`) rather than the plugin.
//
// One deliberate difference from the library's plugin: it keeps the pending
// PKCE verifier in memory, which is right for a long-lived Node process and
// wrong here — a Next.js route handler may serve `/login` and `/login/complete`
// from two different instances, and an in-memory map would lose the verifier
// between them. So the pending login is sealed (its own encryption label, never
// the account store's) and written to the credential table with a short TTL,
// read exactly once, and deleted before the exchange is attempted.
// ─────────────────────────────────────────────────────────────────────────

/** How long a started login stays valid. Long enough to read a consent screen, not much more. */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** A pasted code is short. Generous enough for a whole URL and nothing more. */
const MAX_CODE_LENGTH = 2048;

/**
 * Namespaces the pending login's encryption key.
 *
 * Its own label, never the account store's: a value written here must not open
 * under the credential store's key, so a bug that reads the wrong row fails
 * loudly instead of handing one subsystem another's secret.
 */
const PENDING_LABEL = "leader-claude-login-pending";

export interface ClaudeConnection extends ClaudeAccountStatus {
  /** False when this deployment has no database and therefore nowhere to keep a credential. */
  available: boolean;
}

export const DISCONNECTED: ClaudeConnection = {
  connected: false,
  plan: null,
  expiresAt: null,
  expired: false,
  scopes: [],
  available: true,
};

/** A login the user can fix by doing something differently. Surfaced as a 4xx. */
export class ClaudeLoginRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly restart = false,
  ) {
    super(message);
    this.name = "ClaudeLoginRequestError";
  }
}

interface PendingLogin {
  verifier: string;
  state: string;
}

function pendingKey(accountId: string): string {
  return `leader:pending-claude:${accountId}`;
}

function pendingBox(): SecretBox {
  return new SecretBox(aiHostSecret(), PENDING_LABEL);
}

async function putPending(
  store: CredentialStore,
  accountId: string,
  pending: PendingLogin,
  now: number,
): Promise<void> {
  await store.write(pendingKey(accountId), {
    payload: pendingBox().sealJson(pending),
    meta: { expiresAt: now + PENDING_TTL_MS },
  });
}

/**
 * The pending login for this account, if one is still live.
 *
 * Read, not consumed: a code that fails the state check has not been spent, and
 * making someone restart the whole login over a mispaste would be a worse
 * answer than letting them paste the right one. The row is dropped once the
 * code is actually about to be exchanged, and swept here when it has aged out.
 */
async function readPending(
  store: CredentialStore,
  accountId: string,
  now: number,
): Promise<PendingLogin | null> {
  const record = await store.read(pendingKey(accountId));
  if (!record) return null;

  const expiresAt = Number(record.meta.expiresAt ?? 0);
  if (!expiresAt || expiresAt <= now) {
    await store.delete(pendingKey(accountId));
    return null;
  }

  const payload = pendingBox().openJson<PendingLogin>(record.payload);
  if (!payload || typeof payload.verifier !== "string" || typeof payload.state !== "string") {
    await store.delete(pendingKey(accountId));
    return null;
  }
  return payload;
}

export interface ClaudeAccountDeps {
  store?: CredentialStore;
  now?: () => number;
}

function deps(input: ClaudeAccountDeps = {}) {
  const store = input.store ?? credentialStore();
  return { store, accounts: claudeAccountStore(store), now: input.now ?? Date.now };
}

/** Is this account connected, and to what. */
export async function claudeConnection(
  accountId: string,
  input: ClaudeAccountDeps = {},
): Promise<ClaudeConnection> {
  if (!credentialStoreAvailable()) return { ...DISCONNECTED, available: false };
  const { accounts, now } = deps(input);
  return { ...(await accounts.status(accountId, now())), available: true };
}

/** Begin a login. The verifier stays on the server; only the URL crosses to the browser. */
export async function beginClaudeLogin(
  accountId: string,
  input: ClaudeAccountDeps = {},
): Promise<{ url: string; expiresInSeconds: number }> {
  requireStore();
  const { store, now } = deps(input);
  const started = startClaudeLogin();
  await putPending(store, accountId, { verifier: started.verifier, state: started.state }, now());
  return { url: started.url, expiresInSeconds: Math.round(PENDING_TTL_MS / 1000) };
}

/** Finish a login with the code the user pasted back. */
export async function completeClaudeLogin(
  accountId: string,
  rawCode: unknown,
  input: ClaudeAccountDeps = {},
): Promise<ClaudeConnection> {
  requireStore();
  const { store, accounts, now } = deps(input);

  if (typeof rawCode !== "string" || rawCode.length > MAX_CODE_LENGTH) {
    throw new ClaudeLoginRequestError("bad_code", "Paste the code from the approval page.");
  }

  const pending = await readPending(store, accountId, now());
  if (!pending) {
    throw new ClaudeLoginRequestError(
      "no_pending_login",
      "That login has expired or was never started. Run the command again.",
    );
  }

  const parsed = parsePastedCode(rawCode);
  if (!parsed) {
    throw new ClaudeLoginRequestError("bad_code", "That does not look like an authorization code.");
  }

  // The state binds this code to the login *this* account started. A code
  // obtained in somebody else's approval, pasted here, has to be refused —
  // that is the entire job of the parameter.
  if (parsed.state !== null && !sameState(pending.state, parsed.state)) {
    throw new ClaudeLoginRequestError(
      "state_mismatch",
      "That code came from a different login. Start again and use the newest link.",
    );
  }

  // Single use from here on: a code that failed to exchange cannot be retried,
  // and one that succeeded must not be replayed.
  await store.delete(pendingKey(accountId));

  try {
    const identity = await exchangeClaudeCode({
      code: parsed.code,
      state: pending.state,
      verifier: pending.verifier,
    });
    await accounts.save(accountId, identity);
  } catch (error) {
    if (error instanceof ClaudeLoginError) {
      throw new ClaudeLoginRequestError("exchange_failed", error.message, 400, error.restart);
    }
    throw error;
  }

  return { ...(await accounts.status(accountId, now())), available: true };
}

export async function disconnectClaudeAccount(
  accountId: string,
  input: ClaudeAccountDeps = {},
): Promise<ClaudeConnection> {
  requireStore();
  const { store, accounts } = deps(input);
  await store.delete(pendingKey(accountId));
  await accounts.forget(accountId);
  return { ...DISCONNECTED, available: true };
}

/**
 * A usable access token for this account's subscription.
 *
 * The library refreshes when the stored token has gone stale and writes the
 * rotated refresh token back, deduped per account — nothing to do here beyond
 * asking for it.
 */
export async function claudeAccountToken(
  accountId: string,
  input: ClaudeAccountDeps = {},
): Promise<string> {
  requireStore();
  return deps(input).accounts.token(accountId);
}

function requireStore(): void {
  if (!credentialStoreAvailable()) {
    throw new ClaudeLoginRequestError(
      "no_store",
      "Connecting a subscription needs a credential store, and none is configured.",
      503,
    );
  }
}
