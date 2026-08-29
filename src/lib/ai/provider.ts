// Provider-aware LLM client. User-saved config supports API-key providers and
// three subscription paths, all of them credential handling from
// @flyvendedk799/ai-auth rather than hand-rolled here:
//
//   codex               the Codex CLI login on this machine
//   claude-subscription the Claude Code login on this machine
//   claude-account      the signed-in user's own Claude subscription
//
// The library is the reason the Anthropic subscription requests below look the
// way they do — see `withClaudeCodeIdentity` and `anthropicSubscriptionOptions`
// for why the identity block must be first and why no `x-api-key` is sent.

import { randomUUID } from "node:crypto";
import {
  ClaudeCodeAuthError,
  ClaudeCodeCredential,
  CodexAuthError,
  CodexCredential,
  anthropicSubscriptionOptions,
  codexOptions,
  withClaudeCodeIdentity,
  type SystemBlock,
} from "@flyvendedk799/ai-auth";
import { describeProviderError, type ProviderId } from "@flyvendedk799/ai-auth/registry";
import {
  AI_PROVIDER_DEFAULTS,
  getStoredApiKey,
  isSubscriptionProvider,
  normalizeStoredAiKeys,
  normalizeProvider,
  type AiProvider,
} from "./keys";
import { claudeAccountToken } from "./claude-account";

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
   * Whose subscription pays, for the `claude-account` provider.
   *
   * Only that provider needs it: the credential is stored per LEADer user, so
   * a call without an owner has no plan to bill and says so rather than
   * quietly falling back to somebody else's.
   */
  ownerId?: string;
}

/** Where the registry looks a provider up — it splits by billing, not by vendor. */
export function registryProvider(provider: AiProvider): ProviderId {
  if (provider === "codex") return "codex";
  if (provider === "claude-subscription" || provider === "claude-account") return "claude-code";
  return provider;
}

export function aiConfig(aiKeys?: unknown, ownerId?: string): LlmConfig {
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
      ownerId,
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
    ownerId,
  };
}

export function hasLlm(aiKeys?: unknown): boolean {
  const cfg = aiConfig(aiKeys);
  return isSubscriptionProvider(cfg.provider) || Boolean(cfg.apiKey);
}

/**
 * "The subscription this is configured for is not signed in."
 *
 * Callers treat it as a reason to fall back to deterministic mock output rather
 * than as a failure, so it has to catch every shape of it: the library's two
 * typed auth errors (both of which set `needsLogin`), the per-account store's
 * "nothing connected here", and the message LEADer raised before the library.
 */
export function isMissingSubscriptionLoginError(error: unknown) {
  if (error instanceof ClaudeCodeAuthError || error instanceof CodexAuthError) {
    return error.needsLogin;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /No (?:Codex\/ChatGPT|Claude Code) subscription login found/i.test(message);
}

/** A provider's own refusal, carrying the facts the registry reads off it. */
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly headers?: Headers,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
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
  if (cfg.provider === "claude-subscription" || cfg.provider === "claude-account") {
    return claudeSubscriptionChat(messages, opts, cfg);
  }
  if (!cfg.apiKey) throw new Error("No AI API key configured");
  if (cfg.provider === "anthropic") return anthropicChat(messages, opts, cfg);
  return openAiCompatibleChat(messages, opts, cfg);
}

/**
 * A provider failure, said in a way someone can act on.
 *
 * `describeProviderError` needs the raw error to read status, `retry-after` and
 * Anthropic's own verdict on the plan off the headers — so the raw one is built
 * first and only its description is thrown. The distinction it draws matters
 * most on a subscription: a 429 there usually means *this model* is exhausted
 * while a lighter one still answers, not that the plan is spent.
 */
function providerFailure(
  label: string,
  res: Response,
  body: string,
  cfg: LlmConfig,
): ProviderRequestError {
  const raw = new ProviderRequestError(`${res.status} ${body.slice(0, 2000)}`, res.status, res.headers);
  const described = describeProviderError(raw, registryProvider(cfg.provider), cfg.model, {
    configureAt: "Settings → AI provider",
  });
  return new ProviderRequestError(
    described ?? `${label} request failed (${res.status}): ${body.slice(0, 500)}`,
    res.status,
    res.headers,
  );
}

function systemText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

function anthropicMessages(messages: ChatMessage[]) {
  const out = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
  return out.length ? out : [{ role: "user", content: "Continue." }];
}

function anthropicText(data: { content?: { type?: string; text?: string }[] }): string {
  return data.content?.map((part) => part.text ?? "").join("").trim() ?? "";
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

  if (!res.ok) throw providerFailure("LLM", res, await res.text(), cfg);

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
  const system = systemText(messages);

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: anthropicMessages(messages),
      ...(system ? { system } : {}),
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    }),
  });

  if (!res.ok) throw providerFailure("Claude", res, await res.text(), cfg);
  return anthropicText(await res.json());
}

/** Whichever Claude subscription this config selects, resolved to a live token. */
async function claudeSubscriptionAccessToken(cfg: LlmConfig): Promise<string> {
  if (cfg.provider === "claude-account") {
    if (!cfg.ownerId) {
      throw new ClaudeCodeAuthError(
        "This account has no Claude subscription connected. Connect one in Settings, or choose an API-key provider.",
        true,
      );
    }
    return claudeAccountToken(cfg.ownerId);
  }
  // Re-read on every call: the file belongs to the `claude` CLI, so a sign-in,
  // sign-out or re-auth there is picked up without restarting anything.
  return new ClaudeCodeCredential().token();
}

async function claudeSubscriptionChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  const accessToken = await claudeSubscriptionAccessToken(cfg);
  const system = systemText(messages);

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: claudeSubscriptionHeaders(accessToken),
    body: JSON.stringify({
      model: cfg.model,
      messages: anthropicMessages(messages),
      // The Claude Code identity block, exact text, first position, its own
      // block. Without it Anthropic refuses Opus and Sonnet with a 429 naming a
      // limit the plan is nowhere near — while Haiku, the model you would
      // naturally test with, answers fine.
      system: claudeSystemBlocks(system),
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    }),
  });

  if (!res.ok) throw providerFailure("Claude subscription", res, await res.text(), cfg);
  return anthropicText(await res.json());
}

/**
 * Headers for a Claude request paid for by a subscription.
 *
 * From the library's `anthropicSubscriptionOptions`, which is where the two
 * details that have to be exactly right live: a `Authorization: Bearer` and
 * deliberately **no** `x-api-key`, because Anthropic validates that header
 * whenever it is present — a stray key alongside a valid bearer is rejected,
 * not ignored — plus the beta flags and user-agent a real Claude Code session
 * sends.
 */
export function claudeSubscriptionHeaders(accessToken: string): Record<string, string> {
  const options = anthropicSubscriptionOptions(accessToken);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${options.authToken}`,
    "anthropic-version": "2023-06-01",
    ...(options.defaultHeaders ?? {}),
  };
}

export function claudeSystemBlocks(system: string): SystemBlock[] {
  // An empty prompt is passed as no block at all rather than as an empty one:
  // `withClaudeCodeIdentity` still puts the identity in front either way.
  return withClaudeCodeIdentity(system ? [{ type: "text", text: system }] : []);
}

async function codexSubscriptionChat(
  messages: ChatMessage[],
  opts: ChatOptions,
  cfg: LlmConfig,
): Promise<string> {
  // The library never refreshes this token, on purpose: OpenAI rotates the
  // refresh token on exchange, so refreshing here would leave the user's own
  // Codex CLI holding a credential this server had already spent. An expired
  // token is answered by running `codex` once, which costs them nothing.
  const identity = await new CodexCredential().identity();
  const options = codexOptions(identity);
  const system = systemText(messages);
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
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "OpenAI-Beta": "responses=experimental",
    session_id: randomUUID(),
    // Carries `chatgpt-account-id`, without which the backend cannot tell which
    // subscription to bill and refuses the call.
    ...(options.defaultHeaders ?? {}),
  };

  const res = await fetch(codexResponsesEndpoint(cfg.baseUrl), {
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

  if (!res.ok || !res.body) {
    throw providerFailure("Codex subscription", res, await res.text().catch(() => ""), cfg);
  }

  const text = await readCodexTextStream(res.body);
  if (!text) throw new Error("Codex subscription returned no text content");
  return text;
}

/**
 * The Responses endpoint, from whichever base URL is configured.
 *
 * Both spellings are in circulation: LEADer's own default stops at
 * `/backend-api`, and the library's `CODEX_BASE_URL` already includes `/codex`.
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
