/**
 * Discrete feature extraction for outcome learning.
 *
 * The same function must run on both sides of the loop — once when a decided
 * opportunity becomes a training row, and again when an unseen lead is scored.
 * If the two ever drift apart the learned lift silently stops matching
 * anything, so everything that derives a feature key lives here and nowhere
 * else.
 *
 * Keys are `kind:value`, lowercased and trimmed, so they survive a round-trip
 * through JSON and compare exactly.
 */

/** Shape needed to derive features. Matches Prisma rows and raw candidates. */
export interface FeaturisableOpportunity {
  title?: string | null;
  description?: string | null;
  organization?: string | null;
  category?: string | null;
  applicationRoute?: string | null;
  workspace?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  source?: { name?: string | null } | null;
  sourceName?: string | null;
}

/**
 * Words that carry no discriminating signal in either language. Kept tight on
 * purpose — over-filtering throws away exactly the domain terms we want to
 * learn ("udbud", "tilskud", "voucher").
 */
const STOPWORDS = new Set([
  // English
  "the", "and", "for", "with", "from", "that", "this", "have", "has", "are",
  "was", "were", "will", "your", "you", "our", "their", "its", "into", "over",
  "under", "about", "than", "then", "them", "they", "when", "what", "which",
  "who", "how", "all", "any", "can", "could", "should", "would", "may", "must",
  "new", "more", "most", "other", "some", "such", "only", "own", "same", "also",
  "between", "during", "after", "before", "above", "below", "here", "there",
  // Danish
  "og", "til", "med", "for", "det", "den", "der", "som", "har", "kan", "skal",
  "ved", "fra", "hos", "eller", "men", "ikke", "være", "vaere", "blive", "bliver",
  "efter", "under", "over", "mellem", "samt", "dette", "denne", "disse", "deres",
  "vores", "jeres", "hvor", "hvad", "hvilke", "hvilken", "man", "sig", "selv",
  "alle", "andre", "anden", "andet", "nogle", "noget", "meget", "mere", "mest",
  "vil", "har", "havde", "være", "eget", "egen", "hver", "hvert",
]);

const MAX_TOKENS = 12;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Coarse budget bands — exact kroner never repeat, bands do. */
export function budgetBand(min?: number | null, max?: number | null): string {
  const value = max ?? min ?? null;
  if (value == null) return "unknown";
  if (value < 50_000) return "under-50k";
  if (value < 100_000) return "50k-100k";
  if (value < 250_000) return "100k-250k";
  if (value < 1_000_000) return "250k-1m";
  return "over-1m";
}

/** Salient tokens from the title and category, stopword-filtered. */
export function salientTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawToken of text.toLowerCase().split(/[^a-z0-9æøåäöüéè]+/)) {
    const token = rawToken.trim();
    if (token.length < 4 || token.length > 24) continue;
    if (STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

/**
 * Derive the full feature key set for an opportunity.
 *
 * Only the title (plus category/org) feeds tokens — descriptions are long,
 * noisy and dominated by boilerplate, which would flood the model with
 * near-universal features that carry no lift.
 */
export function opportunityFeatures(o: FeaturisableOpportunity): string[] {
  const features: string[] = [];

  const sourceName = o.source?.name ?? o.sourceName ?? null;
  if (sourceName) features.push(`source:${norm(sourceName)}`);
  if (o.category) features.push(`category:${norm(o.category)}`);
  if (o.applicationRoute) features.push(`route:${norm(o.applicationRoute)}`);
  if (o.organization) features.push(`org:${norm(o.organization)}`);
  if (o.workspace) features.push(`workspace:${norm(o.workspace)}`);
  features.push(`budget:${budgetBand(o.budgetMin, o.budgetMax)}`);

  const tokenText = [o.title, o.category, o.organization].filter(Boolean).join(" ");
  for (const token of salientTokens(tokenText)) features.push(`token:${token}`);

  return Array.from(new Set(features));
}
