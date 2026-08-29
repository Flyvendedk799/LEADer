import { ClaudeAccountStore, type CredentialStore, type StoredRecord } from "@flyvendedk799/ai-auth";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────
// Where @flyvendedk799/ai-auth keeps credentials in LEADer.
//
// The library takes storage as a three-method interface rather than a table,
// and what lands in it is already sealed — so this adapter never holds a token
// in the clear and makes no decisions about cryptography. It maps the
// interface onto the `AiCredential` table through Prisma; the library's own
// Postgres adapter wants a `pg.Pool`, which LEADer does not have.
// ─────────────────────────────────────────────────────────────────────────

/** The slice of `db.aiCredential` this store uses. Narrowed so tests can fake it. */
export interface CredentialRows {
  findUnique(args: { where: { key: string } }): Promise<{ payload: string; meta: unknown } | null>;
  upsert(args: {
    where: { key: string };
    create: { key: string; payload: string; meta: unknown };
    update: { payload: string; meta: unknown };
  }): Promise<unknown>;
  deleteMany(args: { where: { key: string } }): Promise<unknown>;
}

function normalizeMeta(raw: unknown): Record<string, string | number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || value === null) out[key] = value;
  }
  return out;
}

export class PrismaCredentialStore implements CredentialStore {
  constructor(private readonly rows: CredentialRows) {}

  async read(key: string): Promise<StoredRecord | null> {
    const row = await this.rows.findUnique({ where: { key } });
    if (!row) return null;
    return { payload: row.payload, meta: normalizeMeta(row.meta) };
  }

  async write(key: string, record: StoredRecord): Promise<void> {
    const meta = record.meta as unknown;
    await this.rows.upsert({
      where: { key },
      create: { key, payload: record.payload, meta },
      update: { payload: record.payload, meta },
    });
  }

  async delete(key: string): Promise<void> {
    // deleteMany rather than delete: removing a row that is not there is the
    // caller's intent already satisfied, not an error worth throwing over.
    await this.rows.deleteMany({ where: { key } });
  }
}

/**
 * The host secret every sealed value is keyed from.
 *
 * Same resolution order as the per-user API-key blob in `keys.ts`, so a
 * deployment has one secret to set rather than two. Rotating it makes stored
 * credentials unreadable — the library degrades those to "not connected", so
 * recovery is a sign-in rather than a failed boot.
 */
export function aiHostSecret(): string {
  return (
    process.env.AI_KEYS_ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "leader-local-ai-key-secret"
  );
}

/** False when this deployment has no database and therefore nowhere to keep a credential. */
export function credentialStoreAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function credentialStore(): CredentialStore {
  return new PrismaCredentialStore(db.aiCredential as unknown as CredentialRows);
}

/**
 * The per-account Claude subscription store.
 *
 * `namespace` prefixes every key, so this table can hold other things later
 * without a collision. Keyed by LEADer user id: the credential belongs to the
 * person who connected it, which is the entire point of the browser login —
 * a call bills the account that asked for it, not whoever set the server up.
 */
export function claudeAccountStore(store: CredentialStore = credentialStore()): ClaudeAccountStore {
  return new ClaudeAccountStore({ store, secret: aiHostSecret(), namespace: "leader" });
}
