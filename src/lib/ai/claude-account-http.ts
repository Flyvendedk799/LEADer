import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { ClaudeLoginRequestError } from "./claude-account";

/**
 * Error bodies for the Claude login routes.
 *
 * The shape is the library's — `{ error: <code>, message }` — because
 * `@flyvendedk799/ai-auth/react` reads `message` first and falls back to
 * `error`, and the terminal shows whichever it gets. Anything that is not a
 * login problem falls through to LEADer's usual mapping.
 */
export function claudeAuthError(err: unknown): NextResponse {
  if (err instanceof ClaudeLoginRequestError) {
    return NextResponse.json(
      { error: err.code, message: err.message, ...(err.restart ? { restart: true } : {}) },
      { status: err.status },
    );
  }
  return apiError(err);
}
