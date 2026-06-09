import type {
  ScoreBreakdown,
  ScoreComponent,
  ScoreCriterion,
  ScoreWeights,
} from "@/lib/types";
import { CRITERION_LABELS, DEFAULT_WEIGHTS, LEXICON } from "./config";

/**
 * Minimal shape the scorer needs from an opportunity. Works with Prisma rows
 * or plain candidate objects (so ingestion can score before persisting).
 */
export interface ScorableOpportunity {
  title?: string | null;
  description?: string | null;
  rawContent?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  deadline?: Date | string | null;
  organization?: string | null;
  category?: string | null;
  applicationRoute?: string | null;
  contacts?: { email?: string | null; name?: string | null }[];
}

export interface ScoringProfile {
  budgetMaxDkk?: number;
  weights?: Partial<ScoreWeights>;
}

function text(o: ScorableOpportunity): string {
  return [o.title, o.description, o.rawContent, o.organization, o.category]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

/** Fraction of lexicon terms present (saturating, so a few strong hits ≈ 1). */
function lexiconSignal(haystack: string, terms: string[]): number {
  let hits = 0;
  for (const t of terms) if (haystack.includes(t)) hits++;
  if (hits === 0) return 0;
  // 3+ distinct hits saturates to ~1.
  return Math.min(1, 0.4 + 0.3 * hits);
}

function normaliseWeights(w: ScoreWeights): ScoreWeights {
  const sum = Object.values(w).reduce((a, b) => a + (b || 0), 0) || 1;
  const out = {} as ScoreWeights;
  (Object.keys(w) as ScoreCriterion[]).forEach((k) => {
    out[k] = (w[k] || 0) / sum;
  });
  return out;
}

/** Compute the raw 0..1 signal for each criterion. */
function signals(o: ScorableOpportunity, profile: ScoringProfile): Record<ScoreCriterion, { raw: number; note?: string }> {
  const hay = text(o);
  const budgetMax = profile.budgetMaxDkk ?? 100000;
  const value = o.budgetMax ?? o.budgetMin ?? null;

  // Budget fit: best when present and at/under the preferred max.
  let budgetFit = 0.5;
  let budgetNote = "No budget listed";
  if (value != null) {
    if (value <= budgetMax) {
      budgetFit = 1;
      budgetNote = `Within preferred ≤ ${budgetMax.toLocaleString("da-DK")} DKK`;
    } else if (value <= budgetMax * 2) {
      budgetFit = 0.5;
      budgetNote = "Somewhat above preferred max";
    } else {
      budgetFit = 0.15;
      budgetNote = "Well above preferred max";
    }
  }

  // Deadline activity + time sensitivity. Compare timestamps directly for expiry
  // so a deadline that passed a few hours ago isn't rounded up to "today".
  const now = Date.now();
  let activeDeadline = 0.4;
  let timeSensitivity = 0.3;
  let deadlineNote = "No deadline";
  if (o.deadline) {
    const deadlineMs = new Date(o.deadline).getTime();
    const days = Math.floor((deadlineMs - now) / 86400000);
    if (deadlineMs < now) {
      activeDeadline = 0;
      timeSensitivity = 0;
      deadlineNote = "Expired";
    } else {
      activeDeadline = 1;
      deadlineNote = `${days} day(s) left`;
      // Sweet spot ~7–45 days: urgent but actionable.
      timeSensitivity = days <= 3 ? 0.7 : days <= 45 ? 1 : days <= 90 ? 0.6 : 0.35;
    }
  }

  const fullstackRelevance = lexiconSignal(hay, LEXICON.fullstack);
  const aiProductRelevance = lexiconSignal(hay, LEXICON.aiProduct);
  const startupFit = lexiconSignal(hay, LEXICON.startup);
  const voucherResemblance = lexiconSignal(hay, LEXICON.voucher);

  // Direct applicability: explicit route + presence of "apply/contact" cues.
  const routeSignal =
    o.applicationRoute === "DIRECT" ? 1 : o.applicationRoute === "APPLICATION" ? 0.7 : 0.4;
  const directApplicability = Math.max(routeSignal, lexiconSignal(hay, LEXICON.direct));

  // Contactability: contact email/name present.
  const hasContact = (o.contacts || []).some((c) => c.email || c.name);
  const contactability = hasContact ? 1 : lexiconSignal(hay, LEXICON.direct) > 0 ? 0.5 : 0.2;

  // Ambition: longer, richer descriptions imply more substantial work.
  const len = (o.description || o.rawContent || "").length;
  const ambition = Math.min(1, len / 1200);

  // Profile match: blended view of the relevance signals.
  const profileMatch = Math.min(
    1,
    0.35 * fullstackRelevance +
      0.35 * aiProductRelevance +
      0.2 * startupFit +
      0.1 * voucherResemblance,
  );

  return {
    budgetFit: { raw: budgetFit, note: budgetNote },
    activeDeadline: { raw: activeDeadline, note: deadlineNote },
    fullstackRelevance: { raw: fullstackRelevance },
    aiProductRelevance: { raw: aiProductRelevance },
    startupFit: { raw: startupFit },
    directApplicability: { raw: directApplicability },
    voucherResemblance: { raw: voucherResemblance },
    timeSensitivity: { raw: timeSensitivity, note: deadlineNote },
    ambition: { raw: ambition },
    contactability: { raw: contactability, note: hasContact ? "Contact present" : undefined },
    profileMatch: { raw: profileMatch },
  };
}

/** Explainable 0–100 score with a per-criterion breakdown. */
export function scoreOpportunity(
  o: ScorableOpportunity,
  profile: ScoringProfile = {},
): ScoreBreakdown {
  const weights = normaliseWeights({ ...DEFAULT_WEIGHTS, ...(profile.weights || {}) });
  const sig = signals(o, profile);

  const components: ScoreComponent[] = (Object.keys(weights) as ScoreCriterion[]).map(
    (criterion) => {
      const weight = weights[criterion];
      const { raw, note } = sig[criterion];
      const contribution = Math.round(weight * raw * 100);
      return {
        criterion,
        label: CRITERION_LABELS[criterion],
        weight: Number(weight.toFixed(3)),
        raw: Number(raw.toFixed(3)),
        contribution,
        note,
      };
    },
  );

  const total = Math.max(
    0,
    Math.min(100, components.reduce((sum, c) => sum + c.weight * c.raw, 0) * 100),
  );

  return {
    total: Math.round(total),
    components: components.sort((a, b) => b.contribution - a.contribution),
    computedAt: new Date().toISOString(),
  };
}

export { DEFAULT_WEIGHTS, CRITERION_LABELS };
