// Provider-aware LLM client. User-saved config supports OpenAI-compatible chat
// completions and Anthropic Claude. With no key set, callers use the mock path
// in index.ts.

import {
  AI_PROVIDER_DEFAULTS,
  getStoredApiKey,
  normalizeStoredAiKeys,
  type AiProvider,
} from "./keys";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  json?: boolean; // request JSON object output
  maxTokens?: number;
}

export interface LlmConfig {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  embeddingModel?: string;
  source: "user" | "env";
}

export function aiConfig(aiKeys?: unknown): LlmConfig {
  const stored = normalizeStoredAiKeys(aiKeys);
  if (stored?.encryptedApiKey) {
    const defaults = AI_PROVIDER_DEFAULTS[stored.provider];
    return {
      provider: stored.provider,
      apiKey: getStoredApiKey(stored),
      baseUrl: stored.baseUrl || defaults.baseUrl,
      model: stored.model || defaults.model,
      embeddingModel: stored.provider === "openai" ? stored.embeddingModel : undefined,
      source: "user",
    };
  }

  const envProvider: AiProvider = process.env.LLM_PROVIDER === "anthropic" ? "anthropic" : "openai";
  const defaults = AI_PROVIDER_DEFAULTS[envProvider];
  return {
    provider: envProvider,
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || defaults.baseUrl,
    model: process.env.LLM_MODEL || defaults.model,
    embeddingModel:
      envProvider === "openai"
        ? process.env.LLM_EMBEDDING_MODEL || defaults.embeddingModel
        : undefined,
    source: "env",
  };
}

export function hasLlm(aiKeys?: unknown): boolean {
  return Boolean(aiConfig(aiKeys).apiKey);
}

/**
 * Single chat entry point for supported hosted providers.
 * Throws if no key is configured — callers gate on hasLlm() and fall back to mock.
 */
export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
  cfg: LlmConfig = aiConfig(),
): Promise<string> {
  if (!cfg.apiKey) throw new Error("No AI API key configured");
  if (cfg.provider === "anthropic") return anthropicChat(messages, opts, cfg);
  return openAiCompatibleChat(messages, opts, cfg);
}

async function openAiCompatibleChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function anthropicChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: anthropicMessages.length
        ? anthropicMessages
        : [{ role: "user", content: "Continue." }],
      ...(system ? { system } : {}),
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  return data.content?.map((part) => part.text ?? "").join("").trim() ?? "";
}
