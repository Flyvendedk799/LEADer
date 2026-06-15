import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_DAYS } from "./constants";

// Opaque server-side sessions. The cookie holds a high-entropy random token; the
// DB stores only its SHA-256 hash, so a DB compromise alone cannot revive a
// session. Sessions expire and can be revoked individually (logout) or per-user.

export { SESSION_COOKIE };
const TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Create a session row, set the cookie, and return the raw token. */
export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    },
  });
  cookies().set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return token;
}

/** Resolve the current session's userId from the cookie, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Touch lastUsedAt at most ~once/day to avoid a write on every request.
  if (Date.now() - session.lastUsedAt.getTime() > 24 * 60 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return session.userId;
}

/** Destroy the current session (logout) and clear the cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  cookies().delete(SESSION_COOKIE);
}

/** Revoke every session for a user (e.g. after a password change). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/** Best-effort cleanup of expired sessions. */
export async function pruneExpiredSessions(): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}

export { hashToken };
