import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";

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
