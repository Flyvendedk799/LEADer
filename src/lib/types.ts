// Shared TypeScript contracts for LEADer. Import from here — do not redefine.
// These mirror prisma/schema.prisma enums and the JSON blob shapes.

export type Workspace = "DK" | "GLOBAL";

export type SourceType =
  | "PUBLIC_WEB"
  | "RSS"
  | "PROCUREMENT"
  | "ACCELERATOR"
  | "NEWSLETTER"
  | "API"
  | "FACEBOOK_MANUAL"
  | "UPLOAD"
  | "MANUAL";

/** Source types the automated discovery pipeline is allowed to fetch. */
export const AUTOMATABLE_SOURCE_TYPES: SourceType[] = [
  "PUBLIC_WEB",
  "RSS",
  "PROCUREMENT",
  "ACCELERATOR",
  "NEWSLETTER",
  "API",
];

export type MonitorFrequency = "MANUAL" | "HOURLY" | "DAILY" | "WEEKLY";

export type OpportunityStatus =
  | "NEW"
  | "INTERESTING"
  | "WATCH"
  | "CONTACTED"
  | "APPLIED"
  | "WON"
  | "LOST"
  | "ARCHIVED";

export const OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  "NEW",
  "INTERESTING",
  "WATCH",
  "CONTACTED",
  "APPLIED",
  "WON",
  "LOST",
  "ARCHIVED",
];

export type ApplicationRoute = "DIRECT" | "APPLICATION" | "UNKNOWN";
export type IngestMethod = "AUTOMATED" | "MANUAL" | "COMMUNITY";

export type DraftKind =
  | "SUMMARY"
  | "APPLICATION"
  | "PITCH"
  | "EMAIL"
  | "CHECKLIST"
  | "COMPARISON"
  | "EXPLANATION";

export type AlertType = "DEADLINE" | "NEW_HIGH_MATCH" | "DIGEST" | "NEEDS_ACTION";

export type AccountType =
  | "COMPANY"
  | "STARTUP"
  | "PUBLIC_BUYER"
  | "COMMUNITY"
  | "PARTNER"
  | "PERSONA"
  | "UNKNOWN";

export type DealStatus =
  | "DISCOVERED"
  | "QUALIFYING"
  | "INTERESTING"
  | "CONTACTED"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "WON"
  | "LOST"
  | "ARCHIVED";

export const DEAL_STATUSES: DealStatus[] = [
  "DISCOVERED",
  "QUALIFYING",
  "INTERESTING",
  "CONTACTED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ARCHIVED",
];

export type DiscoveryCandidateStatus = "NEW" | "REVIEWED" | "SAVED" | "DISMISSED" | "DUPLICATE";
export type EvidenceKind = "SOURCE_SNIPPET" | "WEB_RESULT" | "STRUCTURED_DATA" | "AI_EXTRACT" | "USER_NOTE";
export type TouchpointKind = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "COMMUNITY" | "MESSAGE" | "OTHER";
export type TaskStatus = "OPEN" | "DONE" | "DISMISSED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ConversionAssetKind =
  | "OUTREACH"
  | "PROPOSAL"
  | "FOLLOW_UP"
  | "CHECKLIST"
  | "CALL_PREP"
  | "PITCH"
  | "SUMMARY";

// ── Scoring ──────────────────────────────────────────────────────────────────

/** Weighted criteria (0..1 each, normalised at scoring time). Customisable in Settings. */
export interface ScoreWeights {
  budgetFit: number; // budget under preferred max (e.g. 100k DKK)
  activeDeadline: number; // has an active, not-expired deadline
  fullstackRelevance: number; // fullstack development relevance
  aiProductRelevance: number; // AI / software / MVP / product strategy
  startupFit: number; // startup / founder / funded-project fit
  directApplicability: number; // an external supplier can apply/contact directly
  voucherResemblance: number; // resembles Erhvervshus / Beyond Beta voucher tasks
  timeSensitivity: number; // urgency / time window
  ambition: number; // complexity / ambition level
  contactability: number; // contact info present / reachable
  profileMatch: number; // overall match with the user's preferred profile
}

export type ScoreCriterion = keyof ScoreWeights;

export interface ScoreComponent {
  criterion: ScoreCriterion;
  label: string;
  weight: number; // normalised 0..1
  raw: number; // 0..1 signal strength
  contribution: number; // points contributed to the final 0..100
  note?: string;
}

export interface ScoreBreakdown {
  total: number; // 0..100
  components: ScoreComponent[];
  computedAt: string;
  /** Present when a learned calibration adjusted this score. */
  calibration?: ScoreCalibrationTrace;
}

// ── Filters / search ─────────────────────────────────────────────────────────

export interface OpportunityFilter {
  q?: string;
  workspace?: Workspace;
  status?: OpportunityStatus[];
  source?: string[]; // sourceId[]
  category?: string[];
  tags?: string[];
  country?: string;
  region?: string;
  budgetMin?: number;
  budgetMax?: number;
  hasBudget?: boolean; // true = has budget, false = missing budget
  deadlineFrom?: string;
  deadlineTo?: string;
  activeOnly?: boolean;
  scoreMin?: number;
  scoreMax?: number;
  applicationRoute?: ApplicationRoute[];
  ingestMethod?: IngestMethod[];
  sort?: "score" | "deadline" | "created" | "budget" | "title";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

// ── AI gateway ───────────────────────────────────────────────────────────────

export type AiAction =
  | "summarize"
  | "extract"
  | "classify"
  | "planDiscoverySearch"
  | "explainScore"
  | "draftApplication"
  | "draftPitch"
  | "draftEmail"
  | "checklist"
  | "compare"
  | "similar"
  | "nextAction"
  | "searchQueries"
  | "qualifyLead"
  | "draftOutreach"
  | "draftProposal"
  | "draftFollowUp"
  | "summarizeAccount"
  | "nextBestAction";

export interface AiRequest {
  action: AiAction;
  opportunityId?: string;
  opportunityIds?: string[]; // for compare/similar
  payload?: Record<string, unknown>; // e.g. raw text for extract
}

export interface AiExtractResult {
  title?: string;
  description?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  deadline?: string;
  organization?: string;
  location?: string;
  country?: string;
  category?: string;
  applicationRoute?: ApplicationRoute;
  contact?: { name?: string; email?: string; phone?: string; role?: string };
  requirements?: string[];
}

export interface AiResult {
  action: AiAction;
  model: string;
  mocked: boolean;
  text?: string; // summaries / drafts / explanations
  data?: unknown; // structured (extract/classify/compare/similar)
}

export type DiscoverySearchMode = "focused" | "balanced" | "wide";

export interface DiscoveryAiSearchPlan {
  summary: string;
  queries: string[];
  requiredTerms: string[];
  excludedTerms: string[];
  positiveKeywords: string[];
  evidenceRequirements: string[];
  suggestedLaneSlug?: string;
  confidence: number;
  notes: string[];
}

// ── Export ───────────────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "xlsx" | "pdf" | "markdown" | "notion";

export interface ExportRow {
  Title: string;
  Source: string;
  URL: string;
  Budget: string;
  Deadline: string;
  Status: string;
  "Match score": string;
  Summary: string;
  Notes: string;
  Tags: string;
  "Next action": string;
}

export interface ExportPreferences {
  defaultFormat: ExportFormat;
  includeNotes: boolean;
  includeSummary: boolean;
}

// ── DTOs / aggregates ────────────────────────────────────────────────────────

export interface DashboardMetrics {
  newLeads: number;
  activeLeads: number;
  upcomingDeadlines: { id: string; title: string; deadline: string; matchScore: number | null }[];
  bestMatches: { id: string; title: string; matchScore: number | null }[];
  watchlistCount: number;
  appliedCount: number;
  wonCount: number;
  lostCount: number;
  pipelineValue: number;
  bySource: { source: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byStatus: { status: OpportunityStatus; count: number }[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Outcome learning (calibration) ───────────────────────────────────────────

/**
 * Outcome-bearing statuses become labelled training rows. `target` is the
 * conversion value we regress against (1 = won, 0 = actively discarded) and
 * `weight` is how much that decision is trusted as evidence.
 */
export interface OutcomeLabel {
  target: number; // 0..1
  weight: number; // 0..1 evidence strength
}

/** One labelled opportunity, ready for the learner. */
export interface OutcomeSample {
  id: string;
  status: OpportunityStatus;
  label: OutcomeLabel;
  /** Raw 0..1 criterion signals as they were at scoring time. */
  raws: Partial<Record<ScoreCriterion, number>>;
  /** Discrete features ("source:x", "category:y", "token:z"). */
  features: string[];
  decidedAt?: string;
}

/** What the learner concluded about a single criterion. */
export interface CriterionCalibration {
  criterion: ScoreCriterion;
  label: string;
  /** Weighted correlation between this signal and conversion, -1..1. */
  correlation: number;
  /** Shrunk weight multiplier applied to the base weight. */
  multiplier: number;
  baseWeight: number; // normalised weight before learning
  learnedWeight: number; // normalised weight after learning
  samples: number; // rows that carried this signal
  direction: "up" | "down" | "flat";
}

/** A discrete feature the learner found predictive. */
export interface FeatureCalibration {
  feature: string; // raw key, e.g. "category:voucher"
  label: string; // human-readable
  /** Shrunk difference from the global mean conversion, roughly -0.5..0.5. */
  lift: number;
  samples: number;
  direction: "up" | "down";
}

/** The learned model: how this owner's real outcomes reshape ranking. */
export interface ScoringCalibrationModel {
  version: number;
  computedAt: string;
  /** Effective (weight-adjusted) sample size behind the model. */
  sampleCount: number;
  rawSampleCount: number;
  outcomeCounts: Partial<Record<OpportunityStatus, number>>;
  /** 0..1 — how much the learned signal is trusted vs. the defaults. */
  confidence: number;
  /** Mean conversion value across all labelled rows. */
  baseRate: number;
  criteria: CriterionCalibration[];
  features: FeatureCalibration[];
  /** True when there was too little evidence to change anything. */
  insufficientData: boolean;
}

/** Recorded on a score when calibration changed the outcome. */
export interface ScoreCalibrationTrace {
  applied: boolean;
  /** Points added/removed by learned feature lift. */
  adjustment: number;
  matchedFeatures: { label: string; lift: number }[];
  sampleCount: number;
  confidence: number;
}
