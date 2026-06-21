/**
 * Local subscription credential harvest.
 *
 * Mirrors the GameHub / OSINT approach: reuse local CLI subscription identities
 * without storing those OAuth tokens in LEADer.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface ClaudeSubscriptionAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface CodexSubscriptionAuth {
  accessToken: string;
  refreshToken: string;
  accountId: string | null;
  expiresAt: number;
}

export function decodeJwtClaims(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function extractAccountId(jwt: string): string | null {
  const claims = decodeJwtClaims(jwt);
  if (!claims) return null;
  if (typeof claims.chatgpt_account_id === "string") return claims.chatgpt_account_id;
  const nested = claims["https://api.openai.com/auth"];
  if (nested && typeof nested === "object") {
    const accountId = (nested as { chatgpt_account_id?: unknown }).chatgpt_account_id;
    if (typeof accountId === "string") return accountId;
  }
  return null;
}

export async function readClaudeSubscriptionAuth(): Promise<ClaudeSubscriptionAuth | null> {
  if (process.platform !== "darwin") return null;

  let raw: string;
  try {
    const { stdout } = await execFileP(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 8000 },
    );
    raw = stdout.trim();
  } catch {
    return null;
  }

  if (!raw) return null;
  try {
    const blob = JSON.parse(raw);
    const inner =
      blob && typeof blob === "object" && "claudeAiOauth" in blob
        ? (blob as { claudeAiOauth?: unknown }).claudeAiOauth
        : blob;
    if (!inner || typeof inner !== "object") return null;
    const record = inner as Record<string, unknown>;
    if (typeof record.accessToken !== "string" || !record.accessToken) return null;
    return {
      accessToken: record.accessToken,
      refreshToken: typeof record.refreshToken === "string" ? record.refreshToken : undefined,
      expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function readCodexSubscriptionAuth(): Promise<CodexSubscriptionAuth | null> {
  const path = process.env.CODEX_AUTH_FILE?.trim() || join(homedir(), ".codex", "auth.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const tokens = parsed?.tokens && typeof parsed.tokens === "object" ? parsed.tokens : parsed;
    const accessToken = tokens?.access_token ?? tokens?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) return null;

    const refreshToken = tokens?.refresh_token ?? tokens?.refreshToken ?? "";
    const idToken = typeof tokens?.id_token === "string" ? tokens.id_token : "";
    const directAccountId = tokens?.account_id ?? tokens?.accountId;
    const accountId =
      typeof directAccountId === "string" && directAccountId
        ? directAccountId
        : idToken
          ? extractAccountId(idToken)
          : null;
    const exp = decodeJwtClaims(accessToken)?.exp;
    const expiresAt = typeof exp === "number" && exp > 0 ? exp * 1000 : Date.now() + 3600_000;

    return {
      accessToken,
      refreshToken: typeof refreshToken === "string" ? refreshToken : "",
      accountId,
      expiresAt,
    };
  } catch {
    return null;
  }
}

export async function refreshCodexSubscriptionAuth(
  refreshToken: string,
): Promise<CodexSubscriptionAuth | null> {
  try {
    const res = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) return null;
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      accountId: json.id_token ? extractAccountId(json.id_token) : null,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
  } catch {
    return null;
  }
}
