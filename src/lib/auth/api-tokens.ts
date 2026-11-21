import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { API_TOKEN_PREFIX, bearerApiToken } from "./constants";

// Personal API tokens: `Authorization: Bearer ldr_<random>`.
//
// A token acts as its owner on every route that resolves the user through
// getCurrentUser(), so scripts and agents use the same API as the browser.
// Like sessions, only the SHA-256 is stored; the raw value is shown once.

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken(): { token: string; prefix: string; tokenHash: string } {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, API_TOKEN_PREFIX.length + 6), tokenHash: hashApiToken(token) };
}

export interface CreatedApiToken {
  id: string;
  name: string;
  prefix: string;
  expiresAt: Date | null;
  createdAt: Date;
  /** The raw token. It is returned once and cannot be recovered later. */
  token: string;
}

export async function createApiToken(
  userId: string,
  input: { name: string; expiresInDays?: number | null },
): Promise<CreatedApiToken> {
  const { token, prefix, tokenHash } = generateApiToken();
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  const row = await db.apiToken.create({
    data: { userId, name: input.name.trim().slice(0, 80) || "API token", prefix, tokenHash, expiresAt },
  });
  return { id: row.id, name: row.name, prefix: row.prefix, expiresAt: row.expiresAt, createdAt: row.createdAt, token };
}

export async function listApiTokens(userId: string) {
  return db.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, expiresAt: true, revokedAt: true, lastUsedAt: true, lastUsedIp: true, createdAt: true },
  });
}

export async function revokeApiToken(userId: string, id: string): Promise<boolean> {
  const { count } = await db.apiToken.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return count > 0;
}

/** Owner id for a raw token, or null when it is unknown, revoked or expired. */
export async function userIdForApiToken(token: string, ip?: string | null): Promise<string | null> {
  const row = await db.apiToken.findUnique({ where: { tokenHash: hashApiToken(token) } });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  // Record use at most once a minute to avoid a write on every request.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.apiToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip?.slice(0, 64) ?? null } })
      .catch(() => {});
  }
  return row.userId;
}

/**
 * The user id behind the request's bearer token, if it carries one.
 * Returns undefined when the request has no API token (so the caller falls back
 * to the session cookie) and null when it has one that is not valid.
 */
export async function getApiTokenUserId(): Promise<string | null | undefined> {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return undefined; // outside a request scope (scripts, worker)
  }
  const token = bearerApiToken(h.get("authorization"));
  if (!token) return undefined;
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return userIdForApiToken(token, ip);
}

/** True when the current request authenticates with an API token rather than a session. */
export async function isApiTokenRequest(): Promise<boolean> {
  try {
    return bearerApiToken((await headers()).get("authorization")) !== null;
  } catch {
    return false;
  }
}

/** Account-level actions (password, new tokens) need a signed-in browser session. */
export async function requireSessionAuth(): Promise<void> {
  if (await isApiTokenRequest()) {
    const err = new Error("This action requires a signed-in session, not an API token") as Error & { status: number };
    err.status = 403;
    throw err;
  }
}
