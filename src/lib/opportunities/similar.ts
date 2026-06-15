import { db } from "@/lib/db";
import { cosineSimilarity, embed, opportunityEmbedText } from "@/lib/ai/embeddings";

// Semantic "find similar" over stored embeddings, with a keyword-overlap fallback
// when embeddings are missing or models are mismatched.

type EmbeddableOpp = {
  id: string;
  title: string | null;
  description: string | null;
  organization: string | null;
  category: string | null;
  rawContent: string | null;
  embedding: number[];
  embeddingModel: string | null;
};

/** Compute + persist an opportunity's embedding. Best-effort; returns success. */
export async function ensureEmbedding(opportunityId: string): Promise<boolean> {
  const o = await db.opportunity.findUnique({ where: { id: opportunityId } });
  if (!o) return false;
  if (o.embedding.length > 0 && o.embeddingModel) return true;
  try {
    const { vector, model } = await embed(opportunityEmbedText(o));
    await db.opportunity.update({
      where: { id: opportunityId },
      data: { embedding: vector, embeddingModel: model, embeddedAt: new Date() },
    });
    return true;
  } catch {
    return false; // never block the caller on embedding failures
  }
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
  // Make sure the target is embedded before we compare.
  await ensureEmbedding(opportunityId);

  const target = (await db.opportunity.findFirst({
    where: { id: opportunityId, ownerId },
    select: {
      id: true, title: true, description: true, organization: true, category: true,
      rawContent: true, embedding: true, embeddingModel: true, workspace: true,
    },
  })) as (EmbeddableOpp & { workspace: string }) | null;
  if (!target) return [];

  const peers = (await db.opportunity.findMany({
    where: { ownerId, id: { not: opportunityId }, workspace: target.workspace as "DK" | "GLOBAL" },
    select: {
      id: true, title: true, description: true, organization: true, category: true,
      rawContent: true, embedding: true, embeddingModel: true, matchScore: true,
      deadline: true, status: true,
    },
    take: 500,
  })) as (EmbeddableOpp & { matchScore: number | null; deadline: Date | null; status: string })[];

  const canEmbed = target.embedding.length > 0 && Boolean(target.embeddingModel);
  const targetTokens = keywordTokens(opportunityEmbedText(target));

  const scored = peers.map((p) => {
    let similarity = 0;
    let method: "embedding" | "keyword" = "keyword";
    if (canEmbed && p.embedding.length === target.embedding.length && p.embeddingModel === target.embeddingModel) {
      similarity = cosineSimilarity(target.embedding, p.embedding);
      method = "embedding";
    } else {
      similarity = jaccard(targetTokens, keywordTokens(opportunityEmbedText(p)));
    }
    return {
      id: p.id,
      title: p.title,
      organization: p.organization,
      category: p.category,
      matchScore: p.matchScore,
      deadline: p.deadline,
      status: p.status,
      similarity,
      method,
    } satisfies SimilarResult;
  });

  return scored
    .filter((s) => s.similarity > 0.01)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
