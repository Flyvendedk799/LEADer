import { createHash } from "node:crypto";
import { aiConfig, hasLlm } from "./provider";

// ─────────────────────────────────────────────────────────────────────────
// EMBEDDINGS — powers true semantic "find similar".
//
// With LLM_API_KEY set, uses the configured OpenAI-compatible /embeddings
// endpoint. Offline, falls back to a deterministic hashed bag-of-words vector so
// similarity still works (language-agnostic, no network). Only vectors produced
// by the SAME model are comparable, so we always store the model alongside.
// ─────────────────────────────────────────────────────────────────────────

export const LOCAL_EMBED_MODEL = "local-hash-256";
const LOCAL_DIM = 256;

export interface Embedding {
  vector: number[];
  model: string;
}

const STOPWORDS = new Set([
  // English
  "the", "and", "for", "with", "that", "this", "from", "have", "are", "was",
  "but", "not", "you", "your", "our", "their", "they", "will", "can", "all",
  // Danish
  "og", "til", "den", "det", "der", "som", "med", "for", "har", "kan", "skal",
  "vil", "ved", "men", "ikke", "være", "deres", "vores", "en", "et", "af", "på",
]);

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

/** Deterministic, dependency-free embedding: hashed bag-of-words, L2-normalised. */
export function localEmbed(text: string, dim = LOCAL_DIM): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    // Stable hash → bucket; sign hashing reduces collisions cancelling signal.
    const h = createHash("md5").update(tok).digest();
    const idx = h.readUInt32BE(0) % dim;
    const sign = (h[4] & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  return l2normalize(vec);
}

/** Cosine similarity of two equal-length vectors (handles non-normalised input). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function providerEmbed(text: string): Promise<Embedding> {
  const cfg = aiConfig();
  const res = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.embeddingModel, input: text.slice(0, 8000) }),
  });
  if (!res.ok) {
    throw new Error(`Embeddings request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { data?: { embedding?: number[] }[] };
  const vector = data.data?.[0]?.embedding;
  if (!vector?.length) throw new Error("Embeddings response missing vector");
  return { vector, model: cfg.embeddingModel };
}

/**
 * Embed text. Uses the provider when configured, otherwise the local fallback.
 * Never throws for the offline path; provider failures bubble up to the caller.
 */
export async function embed(text: string): Promise<Embedding> {
  if (hasLlm()) {
    return providerEmbed(text);
  }
  return { vector: localEmbed(text), model: LOCAL_EMBED_MODEL };
}

/** Compose the canonical text we embed for an opportunity. */
export function opportunityEmbedText(o: {
  title?: string | null;
  description?: string | null;
  organization?: string | null;
  category?: string | null;
  rawContent?: string | null;
}): string {
  return [o.title, o.category, o.organization, o.description, o.rawContent]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}
