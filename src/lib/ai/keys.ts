import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type AiProvider = "openai" | "anthropic";

export interface StoredAiKeys {
  provider: AiProvider;
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
  encryptedApiKey?: string;
  keyPreview?: string;
  updatedAt?: string;
}

export interface PublicAiKeys {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  embeddingModel?: string;
  hasApiKey: boolean;
  keyPreview?: string;
  updatedAt?: string;
}

export interface AiKeysUpdate {
  provider?: AiProvider | "claude" | "openai-compatible";
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
  apiKey?: string;
  clearApiKey?: boolean;
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeProvider(value: unknown): AiProvider {
  if (value === "anthropic" || value === "claude") return "anthropic";
  return "openai";
}

function cleanOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  };
}

export function buildStoredAiKeys(input: AiKeysUpdate, existingRaw?: unknown): StoredAiKeys {
  const existing = normalizeStoredAiKeys(existingRaw);
  const provider = normalizeProvider(input.provider ?? existing?.provider);
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  const sameProvider = !existing || existing.provider === provider;
  const apiKey = input.apiKey?.trim();

  const encryptedApiKey = input.clearApiKey
    ? undefined
    : apiKey
      ? encryptApiKey(apiKey)
      : sameProvider
        ? existing?.encryptedApiKey
        : undefined;

  const keyPreview = input.clearApiKey
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
  return stored;
}

export function getStoredApiKey(raw: unknown): string {
  const stored = normalizeStoredAiKeys(raw);
  if (!stored?.encryptedApiKey) return "";
  return decryptApiKey(stored.encryptedApiKey);
}
