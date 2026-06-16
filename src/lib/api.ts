import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";

/**
 * Constant-time check of the cron shared secret. Accepts it via the
 * `x-cron-secret` header or `Authorization: Bearer <secret>`. Returns false when
 * CRON_SECRET is unset (so unauthenticated scheduler calls are always rejected).
 */
export function validCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Consistent error → HTTP mapping for route handlers. Keeps auth/validation
// failures from collapsing into opaque 500s.
export function apiError(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: err.flatten() }, { status: 400 });
  }
  // Allow callers to attach an explicit HTTP status (e.g. 404/409) to an Error.
  const status = typeof (err as { status?: unknown })?.status === "number"
    ? (err as { status: number }).status
    : 500;
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: message }, { status });
}

/** Error with an explicit HTTP status for apiError() to surface. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}
