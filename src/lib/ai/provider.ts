// Provider-agnostic LLM client (OpenAI-compatible chat completions).
// With no LLM_API_KEY set, callers should use the mock path in index.ts.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  json?: boolean; // request JSON object output
  maxTokens?: number;
}

export function aiConfig() {
  return {
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    embeddingModel: process.env.LLM_EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

export function hasLlm(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

/**
 * Single call into any OpenAI-compatible /chat/completions endpoint.
 * Throws if no key is configured — callers gate on hasLlm() and fall back to mock.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const cfg = aiConfig();
  if (!cfg.apiKey) throw new Error("LLM_API_KEY not set");

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
