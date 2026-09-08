/**
 * Outcome learning — turns the owner's real pipeline decisions into a
 * calibration that reshapes ranking.
 *
 * The static lexicon in `./config` encodes an *assumption* about what good work
 * looks like. This module replaces that assumption with evidence: every
 * opportunity that reached a decision (won, applied, archived, …) is a labelled
 * row, and we learn which criteria and which discrete features actually
 * separated the work the owner pursued and won from the work they threw away.
 *
 * Two guarantees shape every choice here:
 *
 *  1. **It degrades to today's behaviour.** With no outcomes the confidence term
 *     is 0, every multiplier is exactly 1, and scores are identical to the
 *     uncalibrated scorer. Learning can only ever ease the defaults away.
 *  2. **It stays explainable.** No opaque fit — a weighted correlation per
 *     criterion and a shrunk mean-difference per feature, both reportable as a
 *     sentence ("budget fit tracks your wins at r=0.42 over 23 outcomes").
 *
 * Everything here is pure; the DB layer lives in `./outcomes`.
 */
import type {
  CriterionCalibration,
  FeatureCalibration,
  OpportunityStatus,
  OutcomeLabel,
  OutcomeSample,
  ScoreCalibrationTrace,
  ScoreCriterion,
  ScoreWeights,
  ScoringCalibrationModel,
} from "@/lib/types";
import { CRITERION_LABELS, DEFAULT_WEIGHTS } from "./config";

export const CALIBRATION_VERSION = 1;

/**
 * Conversion value and evidence strength per status.
 *
 * `target` is what we regress against. WON is the objective; ARCHIVED is its
 * opposite (the owner saw it and threw it away). LOST sits *above* the midpoint
 * on purpose — a lost bid still means the lead was worth pursuing, which is the
 * scorer's actual job; the win on top of that is the bonus.
 *
 * `weight` is how much the decision is trusted. Terminal states reflect real
 * effort and are near-certain evidence; "interesting"/"watch" are a shrug and
 * count for little.
 */
export const OUTCOME_LABELS: Record<OpportunityStatus, OutcomeLabel | null> = {
  WON: { target: 1.0, weight: 1.0 },
  APPLIED: { target: 0.72, weight: 0.85 },
  CONTACTED: { target: 0.58, weight: 0.6 },
  INTERESTING: { target: 0.5, weight: 0.35 },
  WATCH: { target: 0.46, weight: 0.3 },
  LOST: { target: 0.34, weight: 0.8 },
  ARCHIVED: { target: 0.0, weight: 0.9 },
  NEW: null, // untouched — carries no signal
};

/** Below this many effective samples we report, but never apply, a model. */
export const MIN_EFFECTIVE_SAMPLES = 4;

/** Half-confidence point: ~K effective outcomes buys half the learned effect. */
const CONFIDENCE_K = 12;

/** How hard a perfect correlation is allowed to pull a weight. */
const CRITERION_GAIN = 0.9;
const MULTIPLIER_MIN = 0.4;
const MULTIPLIER_MAX = 2.2;

/** Feature shrinkage: a feature needs several sightings to move the needle. */
const FEATURE_K = 3;
const MIN_FEATURE_SAMPLES = 2;
const MIN_FEATURE_LIFT = 0.03;
const MAX_FEATURES = 40;

/** Bounds on how many points learned features may move a score. */
const FEATURE_POINT_CAP = 12;
const FEATURE_POINT_GAIN = 3;
const MAX_MATCHED_FEATURES = 6;

const CRITERIA = Object.keys(DEFAULT_WEIGHTS) as ScoreCriterion[];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/** Weighted mean of `values` under `weights` (0 when there is no mass). */
function weightedMean(values: number[], weights: number[]): number {
  let sum = 0;
  let mass = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] * weights[i];
    mass += weights[i];
  }
  return mass > 0 ? sum / mass : 0;
}

/**
 * Weighted Pearson correlation between a criterion signal and conversion.
 * Returns 0 when either side is constant — a signal that never varies carries
 * no information, and must not be mistaken for a perfect predictor.
 */
export function weightedCorrelation(xs: number[], ys: number[], weights: number[]): number {
  if (xs.length < 2) return 0;
  const mx = weightedMean(xs, weights);
  const my = weightedMean(ys, weights);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += weights[i] * dx * dy;
    vx += weights[i] * dx * dx;
    vy += weights[i] * dy * dy;
  }
  if (vx <= 1e-9 || vy <= 1e-9) return 0;
  const r = cov / Math.sqrt(vx * vy);
  return Number.isFinite(r) ? clamp(r, -1, 1) : 0;
}

/** Shrinkage toward the prior: 0 samples → 0 trust, K samples → half trust. */
export function confidenceFor(effectiveSamples: number, k = CONFIDENCE_K): number {
  if (effectiveSamples <= 0) return 0;
  return effectiveSamples / (effectiveSamples + k);
}

/** Turn a raw feature key into something a human can read in the UI. */
export function featureLabel(feature: string): string {
  const idx = feature.indexOf(":");
  if (idx < 0) return feature;
  const kind = feature.slice(0, idx);
  const value = feature.slice(idx + 1);
  switch (kind) {
    case "source":
      return `Source: ${value}`;
    case "category":
      return `Category: ${value}`;
    case "route":
      return `Route: ${value}`;
    case "org":
      return `Organisation: ${value}`;
    case "workspace":
      return `Workspace: ${value}`;
    case "budget":
      return `Budget band: ${value}`;
    case "token":
      return `Mentions "${value}"`;
    default:
      return `${kind}: ${value}`;
  }
}

/** Normalise a weight map so the values sum to 1. */
function normalise(w: ScoreWeights): ScoreWeights {
  const sum = Object.values(w).reduce((a, b) => a + (b || 0), 0) || 1;
  const out = {} as ScoreWeights;
  for (const k of Object.keys(w) as ScoreCriterion[]) out[k] = (w[k] || 0) / sum;
  return out;
}

/**
 * Learn a calibration from labelled outcomes.
 *
 * Base weights are the owner's own (or the defaults); learning only rescales
 * them, so a user who has hand-tuned Settings keeps their intent and gets it
 * sharpened rather than overwritten.
 */
export function buildCalibration(
  samples: OutcomeSample[],
  baseWeights: Partial<ScoreWeights> = {},
): ScoringCalibrationModel {
  const weights = normalise({ ...DEFAULT_WEIGHTS, ...baseWeights });
  const computedAt = new Date().toISOString();

  const outcomeCounts: Partial<Record<OpportunityStatus, number>> = {};
  for (const s of samples) {
    outcomeCounts[s.status] = (outcomeCounts[s.status] ?? 0) + 1;
  }

  const effective = samples.reduce((sum, s) => sum + s.label.weight, 0);
  const insufficient = effective < MIN_EFFECTIVE_SAMPLES || samples.length < 2;
  const confidence = insufficient ? 0 : confidenceFor(effective);

  const targets = samples.map((s) => s.label.target);
  const sampleWeights = samples.map((s) => s.label.weight);
  const baseRate = weightedMean(targets, sampleWeights);

  // ── Per-criterion: how well does this signal track conversion? ────────────
  const rawCriteria = CRITERIA.map((criterion) => {
    const xs: number[] = [];
    const ys: number[] = [];
    const ws: number[] = [];
    let seen = 0;
    for (let i = 0; i < samples.length; i++) {
      const raw = samples[i].raws[criterion];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      xs.push(raw);
      ys.push(targets[i]);
      ws.push(sampleWeights[i]);
      seen++;
    }
    const correlation = insufficient ? 0 : weightedCorrelation(xs, ys, ws);
    const rawMultiplier = clamp(1 + CRITERION_GAIN * correlation, MULTIPLIER_MIN, MULTIPLIER_MAX);
    // Shrink toward 1 — with no evidence this is exactly the uncalibrated weight.
    const multiplier = 1 + confidence * (rawMultiplier - 1);
    return { criterion, correlation, multiplier, samples: seen };
  });

  // Rescale then renormalise so the learned weights still sum to 1.
  const learned = {} as ScoreWeights;
  for (const c of rawCriteria) learned[c.criterion] = weights[c.criterion] * c.multiplier;
  const learnedNorm = normalise(learned);

  const criteria: CriterionCalibration[] = rawCriteria
    .map((c) => {
      const baseWeight = round(weights[c.criterion]);
      const learnedWeight = round(learnedNorm[c.criterion]);
      const delta = learnedWeight - baseWeight;
      return {
        criterion: c.criterion,
        label: CRITERION_LABELS[c.criterion],
        correlation: round(c.correlation),
        multiplier: round(c.multiplier),
        baseWeight,
        learnedWeight,
        samples: c.samples,
        direction: (Math.abs(delta) < 0.002 ? "flat" : delta > 0 ? "up" : "down") as
          | "up"
          | "down"
          | "flat",
      };
    })
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // ── Per-feature: which concrete things convert for this owner? ────────────
  const features = insufficient ? [] : buildFeatureLifts(samples, targets, sampleWeights, baseRate);

  return {
    version: CALIBRATION_VERSION,
    computedAt,
    sampleCount: round(effective, 2),
    rawSampleCount: samples.length,
    outcomeCounts,
    confidence: round(confidence),
    baseRate: round(baseRate),
    criteria,
    features,
    insufficientData: insufficient,
  };
}

function buildFeatureLifts(
  samples: OutcomeSample[],
  targets: number[],
  sampleWeights: number[],
  baseRate: number,
): FeatureCalibration[] {
  const stats = new Map<string, { sum: number; mass: number; count: number }>();
  for (let i = 0; i < samples.length; i++) {
    const w = sampleWeights[i];
    for (const feature of new Set(samples[i].features)) {
      const cur = stats.get(feature) ?? { sum: 0, mass: 0, count: 0 };
      cur.sum += targets[i] * w;
      cur.mass += w;
      cur.count += 1;
      stats.set(feature, cur);
    }
  }

  const out: FeatureCalibration[] = [];
  for (const [feature, s] of stats) {
    if (s.count < MIN_FEATURE_SAMPLES || s.mass <= 0) continue;
    const mean = s.sum / s.mass;
    // Shrunk toward the base rate: a feature seen twice barely moves.
    const lift = (s.mass / (s.mass + FEATURE_K)) * (mean - baseRate);
    if (Math.abs(lift) < MIN_FEATURE_LIFT) continue;
    out.push({
      feature,
      label: featureLabel(feature),
      lift: round(lift),
      samples: s.count,
      direction: lift > 0 ? "up" : "down",
    });
  }

  return out.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift)).slice(0, MAX_FEATURES);
}

/**
 * The weights the scorer should actually use. Returns the base weights
 * untouched whenever the model is absent or too thin to trust.
 */
export function calibratedWeights(
  baseWeights: Partial<ScoreWeights> | undefined,
  model: ScoringCalibrationModel | null | undefined,
): Partial<ScoreWeights> | undefined {
  if (!model || model.insufficientData || model.confidence <= 0) return baseWeights;
  const out = {} as ScoreWeights;
  for (const c of model.criteria) out[c.criterion] = c.learnedWeight;
  return out;
}

/**
 * Score adjustment from learned features, in points.
 *
 * Only the strongest few matches count, and the sum is squashed through tanh so
 * a lead that happens to match many weak features can never run away with the
 * score — a smooth ceiling rather than a cliff.
 */
export function featureAdjustment(
  candidateFeatures: string[],
  model: ScoringCalibrationModel | null | undefined,
): ScoreCalibrationTrace | null {
  if (!model || model.insufficientData || model.confidence <= 0) return null;
  if (!model.features.length || !candidateFeatures.length) return null;

  const wanted = new Set(candidateFeatures);
  const matched = model.features
    .filter((f) => wanted.has(f.feature))
    .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift))
    .slice(0, MAX_MATCHED_FEATURES);

  if (!matched.length) return null;

  const sum = matched.reduce((acc, f) => acc + f.lift, 0);
  const adjustment = FEATURE_POINT_CAP * Math.tanh(FEATURE_POINT_GAIN * sum * model.confidence);

  return {
    applied: true,
    adjustment: round(adjustment, 2),
    matchedFeatures: matched.map((f) => ({ label: f.label, lift: f.lift })),
    sampleCount: model.sampleCount,
    confidence: model.confidence,
  };
}
