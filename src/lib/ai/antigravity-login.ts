export const PENDING_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_LENGTH = 2048;

export interface PendingAntigravityLogin {
  verifier: string;
  state: string;
  expiresAt: number;
}

const pending = new Map<string, PendingAntigravityLogin>();

function sweep(now: number): void {
  for (const [key, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(key);
  }
}

export function rememberAntigravityLogin(
  userId: string,
  login: { verifier: string; state: string },
  now = Date.now(),
): void {
  sweep(now);
  pending.set(userId, { ...login, expiresAt: now + PENDING_TTL_MS });
}

export function takeAntigravityLogin(userId: string, now = Date.now()): PendingAntigravityLogin | null {
  sweep(now);
  const entry = pending.get(userId);
  if (!entry) return null;
  pending.delete(userId);
  return entry;
}

export function forgetAntigravityLogin(userId: string): void {
  pending.delete(userId);
}

export function clearPendingAntigravityLogins(): void {
  pending.clear();
}
