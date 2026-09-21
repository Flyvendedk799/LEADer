/**
 * Where AI credentials live, and who they belong to.
 *
 * LEADer supports three ways of paying for a model call, and this module is the
 * seam between them and `@flyvendedk799/ai-auth`:
 *
 *   • a Claude subscription the user connects **here**, from Settings (per-user
 *     OAuth, stored sealed in `AiCredential`) — so a call costs the person who
 *     asked for it rather than whoever runs the server;
 *   • a `claude` or `codex` login already signed in on the host machine, for a
 *     self-hosted instance where the operator's own plan is the point;
 *   • an ordinary API key, encrypted in the user's `aiKeys` blob.
 *
 * The store is a three-method interface, and what lands in it is already sealed
 * by the library — so this adapter never holds a token in the clear.
 */
import { ClaudeAccountStore, ClaudeCodeCredential, CodexCredential, AntigravityAccountStore } from "@flyvendedk799/ai-auth";
import type { CredentialStore, StoredRecord } from "@flyvendedk799/ai-auth";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * The host secret every sealed value is keyed from.
 *
 * Same resolution order the API-key encryption has always used, so one secret
 * covers both and rotating it has one documented consequence rather than two.
 */
export function hostSecret(): string {
  return (
    process.env.AI_KEYS_ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "leader-local-ai-key-secret"
  );
}

/** Keeps this app's rows apart from anything else sharing the table. */
const NAMESPACE = "leader";

/** Prisma-backed `CredentialStore`. Sealed strings in, sealed strings out. */
export class PrismaCredentialStore implements CredentialStore {
  async read(key: string): Promise<StoredRecord | null> {
    const row = await db.aiCredential.findUnique({ where: { key } });
    if (!row) return null;
    const meta =
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, string | number | null>)
        : {};
    return { payload: row.payload, meta };
  }

  async write(key: string, record: StoredRecord): Promise<void> {
    const meta = record.meta as unknown as Prisma.InputJsonValue;
    await db.aiCredential.upsert({
      where: { key },
      create: { key, payload: record.payload, meta },
      update: { payload: record.payload, meta },
    });
  }

  async delete(key: string): Promise<void> {
    // Deleting a row that is not there is the same outcome the caller wanted.
    await db.aiCredential.deleteMany({ where: { key } });
  }
}

let cachedAccountStore: ClaudeAccountStore | null = null;
let cachedAntigravityStore: AntigravityAccountStore | null = null;

/**
 * The per-user Claude subscription store.
 *
 * One instance for the process, because it dedupes in-flight refreshes per
 * account in memory — building a fresh one per request would hand three
 * simultaneous callers three separate refreshes, two of which end up holding a
 * refresh token the third has already rotated away.
 */
export function claudeAccountStore(): ClaudeAccountStore {
  if (!cachedAccountStore) {
    cachedAccountStore = new ClaudeAccountStore({
      store: new PrismaCredentialStore(),
      secret: hostSecret(),
      namespace: NAMESPACE,
    });
  }
  return cachedAccountStore;
}

export function antigravityAccountStore(): AntigravityAccountStore {
  if (!cachedAntigravityStore) {
    cachedAntigravityStore = new AntigravityAccountStore({
      store: new PrismaCredentialStore(),
      secret: hostSecret(),
      namespace: "leader-antigravity",
    });
  }
  return cachedAntigravityStore;
}

/**
 * The `claude` login on the machine running this process, if there is one.
 *
 * Re-read on every call — the file belongs to the CLI, so a sign-in, sign-out or
 * re-auth is picked up without restarting anything. Reads the macOS Keychain and
 * `~/.claude/.credentials.json`, so unlike the code this replaced it also works
 * on the Linux boxes LEADer actually deploys to.
 */
export const localClaudeCredential = new ClaudeCodeCredential();

/** The `codex` login on this machine. Never refreshed here — its CLI owns that. */
export const localCodexCredential = new CodexCredential();
