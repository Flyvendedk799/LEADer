// Edge-safe constants (no Node/Prisma imports) — importable from middleware.
export const SESSION_COOKIE = "leader_session";
export const SESSION_TTL_DAYS = 30;
/** Raw personal API tokens start with this marker (see lib/auth/api-tokens). */
export const API_TOKEN_PREFIX = "ldr_";

/** The API token carried by an Authorization header, or null. Edge-safe. */
export function bearerApiToken(authorization: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  const token = match?.[1] ?? "";
  return token.startsWith(API_TOKEN_PREFIX) && token.length > API_TOKEN_PREFIX.length + 20 ? token : null;
}
