// Tiny in-memory fixed-window rate limiter. Good enough for a single-instance
// power-user app; swap for Redis/Upstash if this ever goes multi-instance.

interface Window {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * @param key    unique bucket key (e.g. `ai:${ownerId}`)
 * @param limit  max requests per window
 * @param windowMs window length in ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const w = buckets.get(key);
  if (!w || now >= w.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (w.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: w.resetAt - now };
  }
  w.count += 1;
  return { ok: true, remaining: limit - w.count, retryAfterMs: 0 };
}

/** Standard 429 response body + headers for route handlers. */
export function tooManyRequests(retryAfterMs: number) {
  return Response.json(
    { error: "Rate limit exceeded. Try again shortly." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}
