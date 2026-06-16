import { db } from "@/lib/db";
import { cosineSimilarity, embed, opportunityEmbedText } from "@/lib/ai/embeddings";

// Semantic "find similar" over stored embeddings, with a keyword-overlap fallback
// when embeddings are missing or models are mismatched.

type TextFields = {
  id: string;
  title: string | null;
  description: string | null;
  organization: string | null;
  category: string | null;
  rawContent: string | null;
};

type EmbeddableOpp = TextFields & {
  embedding: number[];
  embeddingModel: string | null;
};

/** Compute + persist an embedding for an already-loaded row. Returns the vector. */
async function embedAndStore(o: TextFields): Promise<{ vector: number[]; model: string } | null> {
  try {
    const { vector, model } = await embed(opportunityEmbedText(o));
    await db.opportunity.update({
      where: { id: o.id },
      data: { embedding: vector, embeddingModel: model, embeddedAt: new Date() },
    });
    return { vector, model };
  } catch {
    return null; // never block the caller on embedding failures
  }
}

/** Compute + persist an opportunity's embedding if missing. Best-effort. */
export async function ensureEmbedding(opportunityId: string): Promise<boolean> {
  const o = await db.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      id: true, title: true, description: true, organization: true, category: true,
      rawContent: true, embedding: true, embeddingModel: true,
    },
  });
  if (!o) return false;
  if (o.embedding.length > 0 && o.embeddingModel) return true;
  return (await embedAndStore(o)) != null;
}

/** Embed all of an owner's opportunities that don't yet have a vector. */
export async function backfillEmbeddings(ownerId?: string): Promise<{ embedded: number; total: number }> {
  const where = { ...(ownerId ? { ownerId } : {}), embedding: { isEmpty: true } };
  const pending = await db.opportunity.findMany({ where, select: { id: true } });
  let embedded = 0;
  for (const { id } of pending) {
    if (await ensureEmbedding(id)) embedded++;
  }
  return { embedded, total: pending.length };
}

function keywordTokens(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface SimilarResult {
  id: string;
  title: string | null;
  organization: string | null;
  category: string | null;
  matchScore: number | null;
  deadline: Date | null;
  status: string;
  similarity: number; // 0..1
  method: "embedding" | "keyword";
}

/**
 * Rank an owner's other opportunities by similarity to one target. Uses cosine
 * over embeddings (same model only); falls back to keyword overlap otherwise.
 */
export async function findSimilar(
  ownerId: string,
  opportunityId: string,
  limit = 6,
): Promise<SimilarResult[]> {
  // Load the target once (avoids a separate ensureEmbedding round-trip).
  const target = (await db.opportunity.findFirst({
    where: { id: opportunityId, ownerId },
    select: {
      id: true, title: true, description: true, organization: true, category: true,
      rawContent: true, embedding: true, embeddingModel: true, workspace: true,
    },
  })) as (EmbeddableOpp & { workspace: string }) | null;
  if (!target) return [];

  // Embed the target inline if it has no vector yet (reuses the loaded row).
  let targetVector = target.embedding;
  let targetModel = target.embeddingModel;
  if (!(targetVector.length > 0 && targetModel)) {
    const stored = await embedAndStore(target);
    if (stored) {
      targetVector = stored.vector;
      targetModel = stored.model;
    }
  }
  const canEmbed = targetVector.length > 0 && Boolean(targetModel);

  const peers = (await db.opportunity.findMany({
    where: { ownerId, id: { not: opportunityId }, workspace: target.workspace as "DK" | "GLOBAL" },
    select: {
      id: true, title: true, description: true, organization: true, category: true,
      rawContent: true, embedding: true, embeddingModel: true, matchScore: true,
      deadline: true, status: true,
    },
    take: 500,
  })) as (EmbeddableOpp & { matchScore: number | null; deadline: Date | null; status: string })[];

  const meta = (p: (typeof peers)[number]) => ({
    id: p.id,
    title: p.title,
    organization: p.organization,
    category: p.category,
    matchScore: p.matchScore,
    deadline: p.deadline,
    status: p.status,
  });

  // Prefer embeddings: rank peers with a comparable vector by cosine. Only fall
  // back to keyword (Jaccard) for the *whole* set when no comparable embeddings
  // exist — never mix the two incomparable score scales in one ranking.
  if (canEmbed) {
    const comparable = peers.filter(
      (p) => p.embedding.length === targetVector.length && p.embeddingModel === targetModel,
    );
    if (comparable.length > 0) {
      return comparable
        .map((p) => ({ ...meta(p), similarity: cosineSimilarity(targetVector, p.embedding), method: "embedding" as const }))
        .filter((s) => s.similarity > 0.01)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    }
  }

  const targetTokens = keywordTokens(opportunityEmbedText(target));
  return peers
    .map((p) => ({ ...meta(p), similarity: jaccard(targetTokens, keywordTokens(opportunityEmbedText(p))), method: "keyword" as const }))
    .filter((s) => s.similarity > 0.01)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
