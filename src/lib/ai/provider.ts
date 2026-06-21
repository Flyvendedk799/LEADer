// Provider-aware LLM client. User-saved config supports API-key providers and
// local subscription providers harvested from Codex / Claude Code.

import { randomUUID } from "node:crypto";
import {
  AI_PROVIDER_DEFAULTS,
  getStoredApiKey,
  normalizeStoredAiKeys,
  normalizeProvider,
  type AiProvider,
} from "./keys";
import {
  readClaudeSubscriptionAuth,
  readCodexSubscriptionAuth,
  refreshCodexSubscriptionAuth,
} from "./subscriptions";

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
  if (stored && (stored.encryptedApiKey || isSubscriptionProvider(stored.provider))) {
    const defaults = AI_PROVIDER_DEFAULTS[stored.provider];
    return {
      provider: stored.provider,
      apiKey: stored.encryptedApiKey ? getStoredApiKey(stored) : "",
      baseUrl: stored.baseUrl || defaults.baseUrl,
      model: stored.model || defaults.model,
      embeddingModel: stored.provider === "openai" ? stored.embeddingModel : undefined,
      source: "user",
    };
  }

  const envProvider = normalizeProvider(process.env.LLM_PROVIDER || process.env.AI_PROVIDER);
  const defaults = AI_PROVIDER_DEFAULTS[envProvider];
  return {
    provider: envProvider,
    apiKey: isSubscriptionProvider(envProvider) ? "" : process.env.LLM_API_KEY || "",
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
  const cfg = aiConfig(aiKeys);
  return isSubscriptionProvider(cfg.provider) || Boolean(cfg.apiKey);
}

/**
 * Single chat entry point for supported hosted providers.
 * Throws if no key/subscription login is configured — callers gate on hasLlm()
 * and fall back to mock when no live provider is selected.
 */
export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
  cfg: LlmConfig = aiConfig(),
): Promise<string> {
  if (cfg.provider === "codex") return codexSubscriptionChat(messages, opts, cfg);
  if (cfg.provider === "claude-subscription") return claudeSubscriptionChat(messages, opts, cfg);
  if (!cfg.apiKey) throw new Error("No AI API key configured");
  if (cfg.provider === "anthropic") return anthropicChat(messages, opts, cfg);
  return openAiCompatibleChat(messages, opts, cfg);
}

function isSubscriptionProvider(provider: AiProvider): boolean {
  return provider === "codex" || provider === "claude-subscription";
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

async function claudeSubscriptionChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  const auth = await readClaudeSubscriptionAuth();
  if (!auth) {
    throw new Error("No Claude Code subscription login found. Sign in with Claude Code, or choose an API-key provider.");
  }

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

  const baseUrl = cfg.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.accessToken}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
      "user-agent": "claude-cli/2.1.75",
      "x-app": "cli",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: anthropicMessages.length
        ? anthropicMessages
        : [{ role: "user", content: "Continue." }],
      system: [
        { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
        ...(system ? [{ type: "text", text: system }] : []),
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude subscription request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  return data.content?.map((part) => part.text ?? "").join("").trim() ?? "";
}

async function codexSubscriptionChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  let auth = await readCodexSubscriptionAuth();
  if (auth?.expiresAt && auth.expiresAt < Date.now() + 2 * 60 * 1000 && auth.refreshToken) {
    auth = (await refreshCodexSubscriptionAuth(auth.refreshToken)) ?? auth;
  }
  if (!auth) {
    throw new Error("No Codex/ChatGPT subscription login found. Sign in with the Codex CLI, or choose an API-key provider.");
  }

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const input = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      type: "message",
      role: m.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: m.role === "assistant" ? "output_text" : "input_text",
          text: m.content,
        },
      ],
    }));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "OpenAI-Beta": "responses=experimental",
    originator: "codex_cli_rs",
    session_id: randomUUID(),
  };
  if (auth.accountId) headers["chatgpt-account-id"] = auth.accountId;

  const endpoint = codexResponsesEndpoint(cfg.baseUrl);
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      store: false,
      stream: true,
      instructions: system,
      input: input.length ? input : [{ type: "message", role: "user", content: [{ type: "input_text", text: "Continue." }] }],
      include: ["reasoning.encrypted_content"],
      reasoning: { effort: "low", summary: "auto" },
      ...(opts.maxTokens ? { max_output_tokens: opts.maxTokens } : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Codex subscription request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const text = await readCodexTextStream(res.body);
  if (!text) throw new Error("Codex subscription returned no text content");
  return text;
}

function codexResponsesEndpoint(baseUrl: string): string {
  let cleaned = baseUrl;
  while (cleaned.endsWith("/")) cleaned = cleaned.slice(0, -1);
  return cleaned.endsWith("/codex/responses") ? cleaned : `${cleaned}/codex/responses`;
}

async function readCodexTextStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let deltas = "";
  let doneText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          text?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          deltas += event.delta;
        } else if (
          event.type === "response.output_text.done" &&
          typeof event.text === "string" &&
          !deltas
        ) {
          doneText = event.text;
        } else if (event.type === "response.completed" && event.response?.output_text && !deltas) {
          doneText = event.response.output_text;
        }
      } catch {
        // Ignore keepalives and non-JSON SSE frames.
      }
    }
  }

  return (deltas || doneText).trim();
}
