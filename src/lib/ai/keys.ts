import { createDecipheriv, createHash } from "node:crypto";
import { CODEX_BASE_URL, SecretBox, maskSecret } from "@flyvendedk799/ai-auth";
import { hostSecret } from "./credentials";

export type AiProvider = "openai" | "anthropic" | "codex" | "claude-subscription" | "gemini" | "gemini-subscription";
export type SearchProvider = "tavily" | "brave" | "serper";

export interface StoredSearchKey {
  encryptedApiKey?: string;
  keyPreview?: string;
  updatedAt?: string;
}

export interface StoredAiKeys {
  provider: AiProvider;
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
  encryptedApiKey?: string;
  keyPreview?: string;
  updatedAt?: string;
  searchProvider?: SearchProvider;
  searchKeys?: Partial<Record<SearchProvider, StoredSearchKey>>;
}

export interface PublicAiKeys {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  embeddingModel?: string;
  hasApiKey: boolean;
  keyPreview?: string;
  updatedAt?: string;
  searchProvider?: SearchProvider;
  searchKeys?: Record<SearchProvider, { hasApiKey: boolean; keyPreview?: string; updatedAt?: string }>;
}

export interface AiKeysUpdate {
  provider?:
    | AiProvider
    | "claude"
    | "openai-compatible"
    | "codex-subscription"
    | "chatgpt"
    | "chatgpt-subscription"
    | "claude-code"
    | "claude-code-subscription"
    | "antigravity";
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  search?: {
    provider?: SearchProvider;
    apiKey?: string;
    clearApiKey?: boolean;
  };
}

export const AI_PROVIDER_DEFAULTS: Record<
  AiProvider,
  { label: string; baseUrl: string; model: string; embeddingModel?: string }
> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
  },
  anthropic: {
    label: "Claude",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-5",
  },
  gemini: {
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-1.5-flash",
  },
  codex: {
    label: "Codex/ChatGPT subscription",
    baseUrl: CODEX_BASE_URL,
    model: "gpt-5",
  },
  "claude-subscription": {
    label: "Claude Code subscription",
    baseUrl: "https://api.anthropic.com",
    // Sonnet rather than Opus by default: a subscription meters each model on its
    // own allowance, and the heavy one is the one that gets refused first.
    model: "claude-sonnet-5",
  },
  "gemini-subscription": {
    label: "Antigravity subscription",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-1.5-pro",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeProvider(value: unknown): AiProvider {
  if (
    value === "codex" ||
    value === "codex-subscription" ||
    value === "chatgpt" ||
    value === "chatgpt-subscription"
  ) {
    return "codex";
  }
  if (
    value === "claude-subscription" ||
    value === "claude-code" ||
    value === "claude-code-subscription"
  ) {
    return "claude-subscription";
  }
  if (value === "gemini-subscription" || value === "antigravity") {
    return "gemini-subscription";
  }
  if (value === "gemini") return "gemini";
  if (value === "anthropic" || value === "claude") return "anthropic";
  return "openai";
}

function cleanOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSearchProvider(value: unknown): SearchProvider {
  if (value === "brave" || value === "serper") return value;
  return "tavily";
}

function normalizeSearchKeys(raw: unknown): Partial<Record<SearchProvider, StoredSearchKey>> {
  if (!isRecord(raw)) return {};
  const out: Partial<Record<SearchProvider, StoredSearchKey>> = {};
  for (const provider of ["tavily", "brave", "serper"] as SearchProvider[]) {
    const value = raw[provider];
    if (!isRecord(value)) continue;
    const encryptedApiKey = cleanOptionalString(value.encryptedApiKey);
    const keyPreview = cleanOptionalString(value.keyPreview);
    const updatedAt = cleanOptionalString(value.updatedAt);
    if (encryptedApiKey || keyPreview || updatedAt) {
      out[provider] = { encryptedApiKey, keyPreview, updatedAt };
    }
  }
  return out;
}

// ── Encryption at rest ───────────────────────────────────────────────────────
//
// AES-256-GCM through the library's SecretBox, so the key a user pastes and the
// OAuth token a user connects get the same protection from the same tested code
// rather than two hand-rolled variants of it.
//
// The label below is half the encryption key (`sha256(label + ':' + secret)`).
// Changing it does not throw — stored keys simply stop decrypting and every user
// silently reads as unconfigured — so it is a constant and stays one.

const SECRET_LABEL = "leader-ai-keys";

/** Built per call: the host secret can change between requests in tests. */
function box(): SecretBox {
  return new SecretBox(hostSecret(), SECRET_LABEL);
}

export function encryptApiKey(apiKey: string): string {
  return box().seal(apiKey);
}

/**
 * Decrypt a stored key, accepting the format LEADer wrote before it adopted
 * `ai-auth`.
 *
 * The old scheme keyed on `sha256(secret)` with no label and wrote four
 * colon-separated parts (`v1:iv:tag:body`, base64url); the new one writes three
 * (hex). Both are readable here, and a key is re-sealed in the new format the
 * next time its owner saves settings — so nobody has to re-enter a key and no
 * migration has to run against a column full of ciphertext.
 */
export function decryptApiKey(encryptedApiKey: string): string {
  const parts = encryptedApiKey.split(":");
  if (parts.length === 3) {
    const opened = box().open(encryptedApiKey);
    if (opened === null) throw new Error("Stored AI key could not be decrypted");
    return opened;
  }
  return decryptLegacyApiKey(parts);
}

function decryptLegacyApiKey(parts: string[]): string {
  const [version, ivRaw, tagRaw, bodyRaw] = parts;
  if (version !== "v1" || !ivRaw || !tagRaw || !bodyRaw) {
    throw new Error("Unsupported AI key encryption format");
  }
  const key = createHash("sha256").update(hostSecret()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Enough of a key to recognise, never enough to use.
 *
 * Keeps the head as well as the tail, because the head is what says which *kind*
 * of key it is — `sk-ant-`, `sk-proj-` — and a settings page showing four digits
 * cannot tell someone they pasted an OpenAI key into the Anthropic field.
 */
export function apiKeyPreview(apiKey: string): string {
  return maskSecret(apiKey);
}

export function normalizeStoredAiKeys(raw: unknown): StoredAiKeys | null {
  if (!isRecord(raw)) return null;
  const provider = normalizeProvider(raw.provider);
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  return {
    provider,
    baseUrl: cleanOptionalString(raw.baseUrl) ?? defaults.baseUrl,
    model: cleanOptionalString(raw.model) ?? defaults.model,
    embeddingModel:
      provider === "openai"
        ? cleanOptionalString(raw.embeddingModel) ?? defaults.embeddingModel
        : undefined,
    encryptedApiKey: cleanOptionalString(raw.encryptedApiKey),
    keyPreview: cleanOptionalString(raw.keyPreview),
    updatedAt: cleanOptionalString(raw.updatedAt),
    searchProvider: cleanOptionalString(raw.searchProvider)
      ? normalizeSearchProvider(raw.searchProvider)
      : undefined,
    searchKeys: normalizeSearchKeys(raw.searchKeys),
  };
}

export function publicAiKeys(raw: unknown): PublicAiKeys | null {
  const stored = normalizeStoredAiKeys(raw);
  if (!stored) return null;
  const defaults = AI_PROVIDER_DEFAULTS[stored.provider];
  return {
    provider: stored.provider,
    baseUrl: stored.baseUrl ?? defaults.baseUrl,
    model: stored.model ?? defaults.model,
    embeddingModel: stored.provider === "openai" ? stored.embeddingModel : undefined,
    hasApiKey: Boolean(stored.encryptedApiKey),
    keyPreview: stored.keyPreview,
    updatedAt: stored.updatedAt,
    searchProvider: stored.searchProvider,
    searchKeys: {
      tavily: {
        hasApiKey: Boolean(stored.searchKeys?.tavily?.encryptedApiKey),
        keyPreview: stored.searchKeys?.tavily?.keyPreview,
        updatedAt: stored.searchKeys?.tavily?.updatedAt,
      },
      brave: {
        hasApiKey: Boolean(stored.searchKeys?.brave?.encryptedApiKey),
        keyPreview: stored.searchKeys?.brave?.keyPreview,
        updatedAt: stored.searchKeys?.brave?.updatedAt,
      },
      serper: {
        hasApiKey: Boolean(stored.searchKeys?.serper?.encryptedApiKey),
        keyPreview: stored.searchKeys?.serper?.keyPreview,
        updatedAt: stored.searchKeys?.serper?.updatedAt,
      },
    },
  };
}

export function buildStoredAiKeys(input: AiKeysUpdate, existingRaw?: unknown): StoredAiKeys {
  const existing = normalizeStoredAiKeys(existingRaw);
  const provider = normalizeProvider(input.provider ?? existing?.provider);
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  const sameProvider = !existing || existing.provider === provider;
  const usesSubscription = provider === "codex" || provider === "claude-subscription";
  const apiKey = input.apiKey?.trim();

  const encryptedApiKey = input.clearApiKey
    ? undefined
    : usesSubscription
      ? undefined
      : apiKey
        ? encryptApiKey(apiKey)
        : sameProvider
          ? existing?.encryptedApiKey
          : undefined;

  const keyPreview = input.clearApiKey
    ? undefined
    : usesSubscription
      ? undefined
      : apiKey
        ? apiKeyPreview(apiKey)
        : encryptedApiKey
          ? existing?.keyPreview
          : undefined;

  const stored: StoredAiKeys = {
    provider,
    baseUrl: cleanOptionalString(input.baseUrl) ?? existing?.baseUrl ?? defaults.baseUrl,
    model: cleanOptionalString(input.model) ?? existing?.model ?? defaults.model,
    updatedAt: new Date().toISOString(),
  };
  if (provider === "openai") {
    stored.embeddingModel =
      cleanOptionalString(input.embeddingModel) ?? existing?.embeddingModel ?? defaults.embeddingModel;
  }
  if (encryptedApiKey) stored.encryptedApiKey = encryptedApiKey;
  if (keyPreview) stored.keyPreview = keyPreview;

  const searchProvider = normalizeSearchProvider(input.search?.provider ?? existing?.searchProvider);
  const searchKeys: Partial<Record<SearchProvider, StoredSearchKey>> = {
    ...(existing?.searchKeys ?? {}),
  };
  if (input.search) {
    const apiKey = input.search.apiKey?.trim();
    if (input.search.clearApiKey) {
      delete searchKeys[searchProvider];
    } else if (apiKey) {
      searchKeys[searchProvider] = {
        encryptedApiKey: encryptApiKey(apiKey),
        keyPreview: apiKeyPreview(apiKey),
        updatedAt: new Date().toISOString(),
      };
    }
  }
  stored.searchProvider = searchProvider;
  if (Object.keys(searchKeys).length) stored.searchKeys = searchKeys;
  return stored;
}

/**
 * The key to make a call with, or an empty string.
 *
 * Empty rather than an exception when a stored value will not open — which in
 * practice means the host secret was rotated. The caller's own "no key
 * configured" path then runs, so the app degrades to mock output and the fix is
 * for someone to paste the key again; throwing would turn a rotated secret into
 * a 500 on every AI route and give nobody a hint as to why.
 */
export function getStoredApiKey(raw: unknown): string {
  const stored = normalizeStoredAiKeys(raw);
  if (!stored?.encryptedApiKey) return "";
  return openOrEmpty(stored.encryptedApiKey);
}

export function getStoredSearchApiKey(raw: unknown, provider: SearchProvider): string {
  const stored = normalizeStoredAiKeys(raw);
  const encrypted = stored?.searchKeys?.[provider]?.encryptedApiKey;
  return encrypted ? openOrEmpty(encrypted) : "";
}

function openOrEmpty(encrypted: string): string {
  try {
    return decryptApiKey(encrypted);
  } catch {
    return "";
  }
}
