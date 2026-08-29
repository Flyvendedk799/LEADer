/**
 * The half of a Claude subscription login that must never be persisted.
 *
 * `ai-auth` ships these four routes as a Fastify plugin; LEADer is Next.js, so
 * the routes are re-mounted in `app/api/claude-code/**` and the pieces that are
 * actually interesting — the PKCE verifier, the state, the exchange — come from
 * the library. This module holds only the pending login between the two calls.
 *
 * In memory, keyed by user, for ten minutes. Deliberately not in the database:
 * the verifier is worthless after the exchange and dangerous before it, so the
 * shortest possible life is the right one. A deploy mid-login costs somebody one
 * click, which is a better trade than persisting the one secret that makes a
 * stolen authorization code useful.
 *
 * The consequence worth knowing: on a platform that runs several instances, the
 * `login` and `login/complete` calls must reach the same one. LEADer deploys as a
 * single instance; if that ever changes, this is what moves to Redis.
 */

/** Long enough to read a consent screen, not much more. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

/** A pasted code is short. Generous enough for a whole URL and nothing more. */
export const MAX_CODE_LENGTH = 2048;

export interface PendingLogin {
  verifier: string;
  state: string;
  expiresAt: number;
}

const pending = new Map<string, PendingLogin>();

/** Drop anything past its window. Called on each use, so no timer has to exist. */
function sweep(now: number): void {
  for (const [key, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(key);
  }
}

export function rememberLogin(
  userId: string,
  login: { verifier: string; state: string },
  now = Date.now(),
): void {
  sweep(now);
  pending.set(userId, { ...login, expiresAt: now + PENDING_TTL_MS });
}

/**
 * Take the pending login, if there is a live one.
 *
 * Taking rather than reading: a code that failed to exchange cannot be retried
 * and one that succeeded must not be replayed, so either way this login is spent.
 */
export function takeLogin(userId: string, now = Date.now()): PendingLogin | null {
  sweep(now);
  const entry = pending.get(userId);
  if (!entry) return null;
  pending.delete(userId);
  return entry;
}

export function forgetLogin(userId: string): void {
  pending.delete(userId);
}

/** Test seam. */
export function clearPendingLogins(): void {
  pending.clear();
}
