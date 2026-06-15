import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import {
  SESSION_COOKIE,
  createSession,
  destroyCurrentSession,
  getSessionUserId,
  revokeAllSessions,
} from "./session";

// ─────────────────────────────────────────────────────────────────────────
// AUTH — real, multi-user, session-backed.
//
// `getCurrentUser()` resolves the signed-in user from the session cookie. Every
// tenant-scoped query in the app filters by the returned id, so authz is uniform.
//
// Dev convenience: set AUTH_DEV_BYPASS=true to skip login and run as the seeded
// power user (handy for local hacking / e2e). It is IGNORED in production.
// ─────────────────────────────────────────────────────────────────────────

const DEV_EMAIL = process.env.DEV_USER_EMAIL || "owner@leader.local";

function devBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "true";
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user) return user;
  }
  if (devBypassEnabled()) {
    const user = await db.user.findFirst({ where: { email: DEV_EMAIL } });
    if (user) return user;
    return db.user.findFirst();
  }
  return null;
}

/** Owner id of the current user, throwing 401-style if unauthenticated. */
export async function requireOwnerId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// ── Account lifecycle ─────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

/** Register a new user + open a session. Throws on duplicate email. */
export async function register(input: RegisterInput, meta: { userAgent?: string | null; ip?: string | null } = {}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error("An account with that email already exists") as Error & { status: number };
    err.status = 409;
    throw err;
  }
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: { email, name: input.name?.trim() || null, passwordHash },
  });
  await createSession(user.id, meta);
  return user;
}

/** Verify credentials and open a session. Returns null on bad credentials. */
export async function login(
  email: string,
  password: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<User | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await createSession(user.id, meta);
  return user;
}

export async function logout(): Promise<void> {
  await destroyCurrentSession();
}

/** Change password: verify the old one, then re-hash and revoke other sessions. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  // If the account already has a password, require the current one.
  if (user.passwordHash) {
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      const err = new Error("Current password is incorrect") as Error & { status: number };
      err.status = 400;
      throw err;
    }
  }
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
  // Force re-login everywhere else.
  await revokeAllSessions(userId);
}

// Re-export the already-imported bindings (not `export … from`, which can
// resolve to undefined under bundling when the same name is also imported here).
export { SESSION_COOKIE, hashPassword, verifyPassword, createSession, destroyCurrentSession, revokeAllSessions };
