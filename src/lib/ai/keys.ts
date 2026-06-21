import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type AiProvider = "openai" | "anthropic" | "codex" | "claude-subscription";
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
    | "claude-code-subscription";
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
    model: "claude-3-5-sonnet-latest",
  },
  codex: {
    label: "Codex/ChatGPT subscription",
    baseUrl: "https://chatgpt.com/backend-api",
    model: "gpt-5.5",
  },
  "claude-subscription": {
    label: "Claude Code subscription",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-4-8",
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

function encryptionKey(): Buffer {
  const secret =
    process.env.AI_KEYS_ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "leader-local-ai-key-secret";
  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptApiKey(encryptedApiKey: string): string {
  const [version, ivRaw, tagRaw, bodyRaw] = encryptedApiKey.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !bodyRaw) {
    throw new Error("Unsupported AI key encryption format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function apiKeyPreview(apiKey: string): string {
  const clean = apiKey.trim();
  return clean.length > 4 ? `****${clean.slice(-4)}` : "****";
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

export function getStoredApiKey(raw: unknown): string {
  const stored = normalizeStoredAiKeys(raw);
  if (!stored?.encryptedApiKey) return "";
  return decryptApiKey(stored.encryptedApiKey);
}

export function getStoredSearchApiKey(raw: unknown, provider: SearchProvider): string {
  const stored = normalizeStoredAiKeys(raw);
  const encrypted = stored?.searchKeys?.[provider]?.encryptedApiKey;
  return encrypted ? decryptApiKey(encrypted) : "";
}
