// Provider-aware LLM client.
//
// Three ways to pay for a call, behind one `chat()`:
//
//   • an API key the user pasted (OpenAI or Anthropic), encrypted at rest;
//   • a Claude subscription the user connected in Settings — their own plan,
//     billed to them, so a hosted instance does not put every call on whoever
//     set the server up;
//   • a `claude` or `codex` login already on this machine, for a self-hosted
//     instance where the operator's own plan is the point.
//
// The subscription halves are `@flyvendedk799/ai-auth`. What that buys, beyond
// not maintaining an OAuth client: the Claude Code identity block that premium
// models refuse a subscription token without (see `withClaudeCodeIdentity`), the
// header set a real CLI sends, a Codex login that is read and never refreshed
// out from under its own CLI, and error messages that distinguish "this model is
// rate-limited" from "your plan is exhausted".

import { randomUUID } from "node:crypto";
import {
  ClaudeCodeAuthError,
  CodexAuthError,
  AntigravityAuthError,
  anthropicSubscriptionOptions,
  codexOptions,
  describeProviderError,
  providerErrorFacts,
  withClaudeCodeIdentity,
  toCodeAssistRequest,
  antigravityCliOptions,
  antigravityKeyOptions,
} from "@flyvendedk799/ai-auth";
import {
  AI_PROVIDER_DEFAULTS,
  getStoredApiKey,
  normalizeStoredAiKeys,
  normalizeProvider,
  type AiProvider,
} from "./keys";
import {
  claudeAccountStore,
  localClaudeCredential,
  localCodexCredential,
  antigravityAccountStore,
} from "./credentials";
import { registryProvider } from "./registry";

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
  /**
   * Whose subscription to spend, for the providers that have one.
   *
   * The user id. A connected account is looked up under it first; without one —
   * or when nothing is connected — the machine's own CLI login is used instead.
   */
  accountId?: string;
}

export function aiConfig(aiKeys?: unknown, accountId?: string): LlmConfig {
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
      accountId,
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
    accountId,
  };
}

export function hasLlm(aiKeys?: unknown): boolean {
  const cfg = aiConfig(aiKeys);
  return isSubscriptionProvider(cfg.provider) || Boolean(cfg.apiKey);
}

/**
 * "There is no subscription login to use" — the one provider failure that is not
 * an error so much as a configuration state, and the one the AI gateway answers
 * by falling back to deterministic mock output instead of surfacing a 500.
 *
 * The library says so in the type; the regex still covers messages raised before
 * a call reaches it.
 */
export function isMissingSubscriptionLoginError(error: unknown) {
  if (error instanceof ClaudeCodeAuthError || error instanceof CodexAuthError || error instanceof AntigravityAuthError) {
    return error.needsLogin;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /No (?:Codex\/ChatGPT|Claude Code|Antigravity) subscription login found|No (?:Claude Code|Codex) login found|no Claude subscription connected/i.test(
    message,
  );
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
  if (cfg.provider === "gemini-subscription") return geminiSubscriptionChat(messages, opts, cfg);
  if (!cfg.apiKey) throw new Error("No AI API key configured");
  if (cfg.provider === "anthropic") return anthropicChat(messages, opts, cfg);
  if (cfg.provider === "gemini") return geminiChat(messages, opts, cfg);
  return openAiCompatibleChat(messages, opts, cfg);
}

function isSubscriptionProvider(provider: AiProvider): boolean {
  return provider === "codex" || provider === "claude-subscription" || provider === "gemini-subscription";
}

/**
 * Turn a failed response into the most useful sentence available.
 *
 * The facts that separate "this model's allowance is spent" from "the whole plan
 * is exhausted" arrive in *headers* — `retry-after`, the plan's own verdict, its
 * utilisation — and a message built from the status code alone throws them away.
 * A 429 carrying `anthropic-ratelimit-unified-status: allowed` is a per-model
 * limit whose fix is a lighter model; announcing an exhausted plan there sends
 * someone off to wait out a window that was never the problem.
 */
async function providerFailure(
  res: Response,
  cfg: LlmConfig,
  fallbackLabel: string,
): Promise<Error> {
  const body = await res.text().catch(() => "");
  const raw = `${fallbackLabel} failed (${res.status}): ${body.slice(0, 500)}`;
  const shaped = { status: res.status, headers: res.headers, message: body || raw };
  const described = describeProviderError(shaped, registryProvider(cfg.provider), cfg.model, {
    configureAt: "Settings → AI provider",
  });
  const error = new Error(described ?? raw) as Error & {
    status: number;
    facts: ReturnType<typeof providerErrorFacts>;
  };
  error.status = res.status;
  error.facts = providerErrorFacts(shaped);
  return error;
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

  if (!res.ok) throw await providerFailure(res, cfg, "LLM request");

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** System text and non-system turns, in the shape the Messages API takes. */
function splitForAnthropic(messages: ChatMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
  return {
    system,
    messages: turns.length ? turns : [{ role: "user", content: "Continue." }],
  };
}

async function anthropicChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  const split = splitForAnthropic(messages);

  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: split.messages,
      ...(split.system ? { system: split.system } : {}),
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    }),
  });

  if (!res.ok) throw await providerFailure(res, cfg, "Claude request");
  return anthropicText(await res.json());
}

/**
 * A usable Claude subscription token, whoever's it is.
 *
 * The account the user connected here comes first — that is the whole point of
 * the per-user login, and on a hosted instance it is the only credential that
 * bills the person who asked. The machine's own `claude` login is the fallback,
 * for a self-hosted box where the operator's plan is meant to pay.
 */
export async function claudeSubscriptionToken(accountId?: string): Promise<string> {
  if (accountId) {
    const store = claudeAccountStore();
    const status = await store.status(accountId).catch(() => null);
    if (status?.connected) return store.token(accountId);
  }
  return localClaudeCredential.token();
}

async function claudeSubscriptionChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  const token = await claudeSubscriptionToken(cfg.accountId);
  const split = splitForAnthropic(messages);
  const client = anthropicSubscriptionOptions(token);

  const baseUrl = cfg.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // `Authorization: Bearer`, never `x-api-key`: Anthropic validates the
      // latter whenever the header is present, so a stray key alongside a good
      // bearer token is rejected rather than ignored.
      Authorization: `Bearer ${client.authToken}`,
      "anthropic-version": "2023-06-01",
      ...client.defaultHeaders,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: split.messages,
      // Not decoration. Without the Claude Code identity as the *first* system
      // block, in its own block, verbatim, Anthropic refuses Opus and Sonnet on
      // a subscription token with a 429 naming a limit the plan is nowhere near
      // — while Haiku, the model you would naturally test with, answers fine.
      system: withClaudeCodeIdentity(split.system || []),
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    }),
  });

  if (!res.ok) throw await providerFailure(res, cfg, "Claude subscription request");
  return anthropicText(await res.json());
}

function anthropicText(payload: unknown): string {
  const data = payload as { content?: { type?: string; text?: string }[] };
  return data.content?.map((part) => part.text ?? "").join("").trim() ?? "";
}

async function codexSubscriptionChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  // Read, never refreshed: the `codex` CLI rotates its own refresh token, and a
  // refresh performed here would leave the user's CLI holding a credential this
  // process had already spent. An expired login is answered by running `codex`.
  const identity = await localCodexCredential.identity();
  const client = codexOptions(identity, cfg.baseUrl);

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
    Authorization: `Bearer ${client.apiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "OpenAI-Beta": "responses=experimental",
    session_id: randomUUID(),
    ...client.defaultHeaders,
  };

  const res = await fetch(codexResponsesEndpoint(client.baseURL ?? cfg.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      store: false,
      stream: true,
      instructions: system,
      input: input.length
        ? input
        : [{ type: "message", role: "user", content: [{ type: "input_text", text: "Continue." }] }],
      include: ["reasoning.encrypted_content"],
      reasoning: { effort: "low", summary: "auto" },
      ...(opts.maxTokens ? { max_output_tokens: opts.maxTokens } : {}),
    }),
  });

  if (!res.ok || !res.body) throw await providerFailure(res, cfg, "Codex subscription request");

  const text = await readCodexTextStream(res.body);
  if (!text) throw new Error("Codex subscription returned no text content");
  return text;
}

/**
 * The Responses endpoint, from whichever base URL a config happens to hold.
 *
 * Two shapes are in circulation — `…/backend-api` from the settings LEADer used
 * to write, and `…/backend-api/codex`, which is the library's constant and the
 * current default — so both have to land on the same URL.
 */
export function codexResponsesEndpoint(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  if (cleaned.endsWith("/codex/responses")) return cleaned;
  if (cleaned.endsWith("/codex")) return `${cleaned}/responses`;
  return `${cleaned}/codex/responses`;
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


async function geminiChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  const clientOptions = antigravityKeyOptions(cfg.apiKey, cfg.baseUrl);
  
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const turns = messages.filter(m => m.role !== "system").map(m => ({
    role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
    parts: [{ text: m.content }],
  }));

  const request = toCodeAssistRequest(cfg.model || "", turns, { systemInstruction: system });
  const baseURL = clientOptions.baseURL || "https://generativelanguage.googleapis.com/v1beta";

  const url = new URL(`${baseURL}/models/${request.model}:generateContent`);
  url.searchParams.set("key", clientOptions.apiKey || "");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.request),
  });

  if (!res.ok) throw await providerFailure(res, cfg, "Gemini request");

  const body = (await res.json()) as any;
  return body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function geminiSubscriptionChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  if (!cfg.accountId) throw new Error("No account ID provided for Antigravity subscription");
  const store = antigravityAccountStore();
  const status = await store.status(cfg.accountId).catch(() => null);
  if (!status?.connected) throw new AntigravityAuthError("No Antigravity subscription connected", true);

  const accessToken = await store.token(cfg.accountId);

  const identity = {
    accessToken,
    refreshToken: "",
    expiresAt: 0,
    email: null,
    projectId: status.projectId || null,
    isDogfood: false,
  } as any;

  const clientOptions = antigravityCliOptions(identity, cfg.baseUrl || "");

  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const turns = messages.filter(m => m.role !== "system").map(m => ({
    role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
    parts: [{ text: m.content }],
  }));

  const request = toCodeAssistRequest(cfg.model || "", turns, { systemInstruction: system });

  const res = await fetch(`${clientOptions.baseURL}/generateContent`, {
    method: "POST",
    headers: clientOptions.defaultHeaders,
    body: JSON.stringify(request),
  });

  if (!res.ok) throw await providerFailure(res, cfg, "Antigravity subscription request");

  const body = (await res.json()) as any;
  return body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
