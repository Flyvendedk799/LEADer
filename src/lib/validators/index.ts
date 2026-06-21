import { z } from "zod";
import type { OpportunityFilter } from "@/lib/types";

// Shared enums (kept in sync with prisma/schema.prisma + lib/types.ts).
export const zWorkspace = z.enum(["DK", "GLOBAL"]);
export const zSourceType = z.enum([
  "PUBLIC_WEB", "RSS", "PROCUREMENT", "ACCELERATOR", "NEWSLETTER", "API",
  "FACEBOOK_MANUAL", "UPLOAD", "MANUAL",
]);
export const zFrequency = z.enum(["MANUAL", "HOURLY", "DAILY", "WEEKLY"]);
export const zStatus = z.enum([
  "NEW", "INTERESTING", "WATCH", "CONTACTED", "APPLIED", "WON", "LOST", "ARCHIVED",
]);
export const zAccountType = z.enum([
  "COMPANY", "STARTUP", "PUBLIC_BUYER", "COMMUNITY", "PARTNER", "PERSONA", "UNKNOWN",
]);
export const zDealStatus = z.enum([
  "DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ARCHIVED",
]);
export const zDiscoveryCandidateStatus = z.enum(["NEW", "REVIEWED", "SAVED", "DISMISSED", "DUPLICATE"]);
export const zEvidenceKind = z.enum(["SOURCE_SNIPPET", "WEB_RESULT", "STRUCTURED_DATA", "AI_EXTRACT", "USER_NOTE"]);
export const zTouchpointKind = z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "COMMUNITY", "MESSAGE", "OTHER"]);
export const zTaskStatus = z.enum(["OPEN", "DONE", "DISMISSED"]);
export const zTaskPriority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const zConversionAssetKind = z.enum(["OUTREACH", "PROPOSAL", "FOLLOW_UP", "CHECKLIST", "CALL_PREP", "PITCH", "SUMMARY"]);
export const zApplicationRoute = z.enum(["DIRECT", "APPLICATION", "UNKNOWN"]);
export const zIngestMethod = z.enum(["AUTOMATED", "MANUAL", "COMMUNITY"]);
export const zDraftKind = z.enum([
  "SUMMARY", "APPLICATION", "PITCH", "EMAIL", "CHECKLIST", "COMPARISON", "EXPLANATION",
]);
export const zExportFormat = z.enum(["csv", "xlsx", "pdf", "markdown", "notion"]);
export const zAiAction = z.enum([
  "summarize", "extract", "classify", "planDiscoverySearch", "explainScore", "draftApplication",
  "draftPitch", "draftEmail", "checklist", "compare", "similar", "nextAction",
  "searchQueries", "qualifyLead", "draftOutreach", "draftProposal", "draftFollowUp", "summarizeAccount", "nextBestAction",
]);
export const zAiProvider = z.enum(["openai", "anthropic", "codex", "claude-subscription"]);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).optional(),
});
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().default(""),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// ── Source ───────────────────────────────────────────────────────────────────
export const sourceCreateSchema = z.object({
  name: z.string().min(2),
  url: z.string().url().optional().or(z.literal("")),
  type: zSourceType,
  workspace: zWorkspace.default("DK"),
  frequency: zFrequency.default("DAILY"),
  keywords: z.array(z.string()).default([]),
  country: z.string().optional(),
  region: z.string().optional(),
  category: z.string().optional(),
  enabled: z.boolean().default(true),
  parserKey: z.string().optional(),
  notes: z.string().optional(),
});
export const sourceUpdateSchema = sourceCreateSchema.partial();

// ── Opportunity ──────────────────────────────────────────────────────────────
const opportunityBase = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  rawContent: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
  organization: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  category: z.string().optional(),
  workspace: zWorkspace.default("DK"),
  budgetMin: z.number().int().nonnegative().optional(),
  budgetMax: z.number().int().nonnegative().optional(),
  currency: z.string().default("DKK"),
  deadline: z.coerce.date().optional(),
  status: zStatus.default("NEW"),
  applicationRoute: zApplicationRoute.default("UNKNOWN"),
  priority: z.number().int().min(0).max(3).default(0),
  sourceId: z.string().optional(),
});

export const opportunityCreateSchema = opportunityBase.refine(
  (d) => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax,
  { message: "budgetMin must be less than or equal to budgetMax", path: ["budgetMax"] },
);
export const opportunityUpdateSchema = opportunityBase.partial().extend({
  isActive: z.boolean().optional(),
});

export const noteCreateSchema = z.object({ body: z.string().min(1), pinned: z.boolean().optional() });

// Bulk operations over a selection of opportunities (owner-scoped server-side).
export const zBulkAction = z.enum([
  "setStatus",
  "setPriority",
  "addToWatchlist",
  "removeFromWatchlist",
  "addToList",
  "delete",
]);
export const bulkOpportunitySchema = z
  .object({
    ids: z.array(z.string()).min(1, "Select at least one opportunity").max(500),
    action: zBulkAction,
    status: zStatus.optional(),
    priority: z.number().int().min(0).max(3).optional(),
    listId: z.string().optional(),
  })
  .refine((d) => d.action !== "setStatus" || d.status != null, {
    message: "status is required for setStatus",
    path: ["status"],
  })
  .refine((d) => d.action !== "setPriority" || d.priority != null, {
    message: "priority is required for setPriority",
    path: ["priority"],
  })
  .refine((d) => d.action !== "addToList" || !!d.listId, {
    message: "listId is required for addToList",
    path: ["listId"],
  });

// ── Lists / watchlist / saved searches ───────────────────────────────────────
export const listCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
});
export const listItemSchema = z.object({ opportunityId: z.string() });
export const watchlistSchema = z.object({
  opportunityId: z.string(),
  priority: z.number().int().min(1).max(3).default(1),
  reminderAt: z.coerce.date().optional(),
});
export const savedSearchSchema = z.object({
  name: z.string().min(1),
  filters: z.record(z.unknown()),
});

// ── Community import ─────────────────────────────────────────────────────────
export const communityImportSchema = z.object({
  groupName: z.string().optional(),
  author: z.string().optional(),
  postDate: z.coerce.date().optional(),
  url: z.string().url().optional().or(z.literal("")),
  content: z.string().min(10, "Paste the post content (min 10 chars)"),
  notes: z.string().optional(),
  workspace: zWorkspace.default("DK"),
  autoExtract: z.boolean().default(true),
});

// ── AI / export ──────────────────────────────────────────────────────────────
export const aiRequestSchema = z.object({
  action: zAiAction,
  opportunityId: z.string().optional(),
  opportunityIds: z.array(z.string()).optional(),
  dealId: z.string().optional(),
  accountId: z.string().optional(),
  candidateId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  save: z.boolean().optional(), // persist drafts
});

export const exportRequestSchema = z.object({
  format: zExportFormat,
  ids: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  title: z.string().optional(),
});

// ── Discovery ────────────────────────────────────────────────────────────────
export const discoverySearchSchema = z.object({
  query: z.string().min(3).max(500),
  workspace: zWorkspace.default("DK"),
  maxResults: z.number().int().min(4).max(30).default(12),
  includeWeb: z.boolean().default(true),
  includeSources: z.boolean().default(true),
  provider: z.enum(["auto", "tavily", "brave", "serper", "none"]).default("auto"),
  resultKind: z.enum(["all", "opportunities", "sources"]).default("all"),
});

const discoveryAttachmentSchema = z.object({
  label: z.string().optional(),
  url: z.string().url(),
  kind: z.string().optional(),
});

export const discoveryCandidateSchema = z.object({
  id: z.string().optional(),
  candidateKind: z.enum(["opportunity", "source"]).default("opportunity"),
  title: z.string().min(3),
  description: z.string().optional(),
  summaryDa: z.string().optional(),
  rawContent: z.string().optional(),
  detailText: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
  organization: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  category: z.string().optional(),
  budgetMin: z.number().int().nonnegative().optional(),
  budgetMax: z.number().int().nonnegative().optional(),
  currency: z.string().default("DKK"),
  priceText: z.string().optional(),
  deadline: z.string().optional(),
  postedAt: z.string().optional(),
  freshness: z.enum(["active", "expired", "stale", "unknown"]).default("unknown"),
  applicationRoute: zApplicationRoute.default("UNKNOWN"),
  contacts: z
    .array(z.object({ name: z.string().optional(), email: z.string().optional(), role: z.string().optional() }))
    .default([]),
  attachments: z.array(discoveryAttachmentSchema).default([]),
  sourceName: z.string().default("Discover"),
  sourceKind: z.enum(["web-search", "source-scan"]).default("web-search"),
  provider: z.string().default("discover"),
  query: z.string().default(""),
  matchScore: z.number().optional(),
  scoreBreakdown: z.record(z.unknown()).optional(),
  reasons: z.array(z.string()).default([]),
  signals: z.array(z.string()).default([]),
  feedback: z.enum(["GOOD_RESULT", "NON_LEAD"]).optional(),
  feedbackSuppressed: z.boolean().optional(),
  alreadySaved: z.object({ id: z.string(), title: z.string() }).optional(),
  alreadySavedSource: z.object({ id: z.string(), name: z.string() }).optional(),
});

export const discoverySaveSchema = z.object({
  workspace: zWorkspace.default("DK"),
  candidate: discoveryCandidateSchema.refine(
    (d) => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax,
    { message: "budgetMin must be less than or equal to budgetMax", path: ["budgetMax"] },
  ),
});

export const discoverySaveSourceSchema = z.object({
  workspace: zWorkspace.default("DK"),
  candidate: discoveryCandidateSchema
    .extend({ url: z.string().url() })
    .refine((d) => d.candidateKind === "source", {
      message: "candidateKind must be source",
      path: ["candidateKind"],
    }),
});

export const discoveryFeedbackSchema = z.object({
  candidate: discoveryCandidateSchema,
  feedback: z.enum(["GOOD_RESULT", "NON_LEAD"]),
  reason: z.string().max(240).optional(),
});

// ── CRM V2 ──────────────────────────────────────────────────────────────────
export const discoveryLaneCreateSchema = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  description: z.string().min(5),
  workspace: zWorkspace.default("DK"),
  active: z.boolean().default(true),
  sourceTypes: z.array(zSourceType).default([]),
  queryTemplates: z.array(z.string()).default([]),
  positiveKeywords: z.array(z.string()).default([]),
  negativeKeywords: z.array(z.string()).default([]),
  scoringConfig: z.record(z.number()).optional(),
  evidenceRequirements: z.array(z.string()).default([]),
  conversionGuidance: z.string().optional(),
});

export const discoveryRunCreateSchema = z.object({
  laneId: z.string().min(1),
  query: z.string().max(500).optional(),
  freeformBrief: z.string().max(1200).optional(),
  useAiPlanner: z.boolean().default(false),
  searchMode: z.enum(["focused", "balanced", "wide"]).default("balanced"),
  queryCount: z.number().int().min(1).max(8).optional(),
  requiredTerms: z.array(z.string().min(1).max(80)).max(12).default([]),
  excludedTerms: z.array(z.string().min(1).max(80)).max(12).default([]),
  workspace: zWorkspace.optional(),
  maxResults: z.number().int().min(4).max(30).default(12),
  includeWeb: z.boolean().default(true),
  includeSources: z.boolean().default(true),
  provider: z.enum(["auto", "tavily", "brave", "serper", "none"]).default("auto"),
});

export const discoveryCandidateActionSchema = z.object({
  action: z.enum(["review", "save", "dismiss", "duplicate", "feedback"]),
  reason: z.string().optional(),
  feedback: z.record(z.unknown()).optional(),
  status: zDiscoveryCandidateStatus.optional(),
});

export const accountCreateSchema = z.object({
  name: z.string().min(1),
  type: zAccountType.default("UNKNOWN"),
  website: z.string().url().optional().or(z.literal("")),
  domain: z.string().optional(),
  description: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  workspace: zWorkspace.default("DK"),
  source: z.string().optional(),
  fitScore: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).default([]),
});
export const accountUpdateSchema = accountCreateSchema.partial();

export const personCreateSchema = z.object({
  accountId: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedin: z.string().optional(),
  notes: z.string().optional(),
});

export const dealCreateSchema = z.object({
  accountId: z.string().optional(),
  sourceId: z.string().optional(),
  laneId: z.string().optional(),
  title: z.string().min(3),
  summary: z.string().optional(),
  rawContent: z.string().optional(),
  valueMin: z.number().int().nonnegative().optional(),
  valueMax: z.number().int().nonnegative().optional(),
  currency: z.string().default("DKK"),
  deadline: z.coerce.date().optional(),
  status: zDealStatus.default("DISCOVERED"),
  priority: z.number().int().min(0).max(3).default(0),
  workspace: zWorkspace.default("DK"),
  category: z.string().optional(),
  applicationRoute: zApplicationRoute.default("UNKNOWN"),
  url: z.string().url().optional().or(z.literal("")),
  matchScore: z.number().int().min(0).max(100).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  pursuitScore: z.number().int().min(0).max(100).optional(),
  nextAction: z.string().optional(),
});
export const dealUpdateSchema = dealCreateSchema.partial().extend({
  wonLostReason: z.string().optional(),
  statusReason: z.string().optional(),
});

export const taskCreateSchema = z.object({
  accountId: z.string().optional(),
  dealId: z.string().optional(),
  personId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: z.coerce.date().optional(),
  status: zTaskStatus.default("OPEN"),
  priority: zTaskPriority.default("MEDIUM"),
});
export const taskPatchSchema = taskCreateSchema.partial().extend({ id: z.string().min(1) });

export const touchpointCreateSchema = z.object({
  accountId: z.string().optional(),
  dealId: z.string().optional(),
  personId: z.string().optional(),
  kind: zTouchpointKind.default("NOTE"),
  occurredAt: z.coerce.date().optional(),
  summary: z.string().min(1),
  body: z.string().optional(),
  outcome: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const conversionAssetCreateSchema = z.object({
  accountId: z.string().optional(),
  dealId: z.string().optional(),
  candidateId: z.string().optional(),
  kind: zConversionAssetKind.default("SUMMARY"),
  title: z.string().optional(),
  content: z.string().min(1),
  model: z.string().optional(),
  promptSnapshot: z.string().optional(),
});

// ── Settings ─────────────────────────────────────────────────────────────────
export const settingsSchema = z.object({
  name: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().optional(),
  preferredProjectTypes: z.array(z.string()).optional(),
  excludedCategories: z.array(z.string()).optional(),
  budgetMaxDkk: z.number().int().positive().optional(),
  preferredCurrency: z.string().optional(),
  scoringWeights: z.record(z.number()).optional(),
  exportPrefs: z.record(z.unknown()).optional(),
  aiKeys: z
    .object({
      provider: z
        .union([
          zAiProvider,
          z.literal("claude"),
          z.literal("openai-compatible"),
          z.literal("codex-subscription"),
          z.literal("chatgpt"),
          z.literal("chatgpt-subscription"),
          z.literal("claude-code"),
          z.literal("claude-code-subscription"),
        ])
        .optional(),
      baseUrl: z.string().optional(),
      model: z.string().optional(),
      embeddingModel: z.string().optional(),
      apiKey: z.string().optional(),
      clearApiKey: z.boolean().optional(),
      search: z
        .object({
          provider: z.enum(["tavily", "brave", "serper"]).optional(),
          apiKey: z.string().optional(),
          clearApiKey: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  completeOnboarding: z.boolean().optional(),
});

// ── Filter parsing (querystring → OpportunityFilter) ─────────────────────────
const STATUS_VALUES = zStatus.options as readonly string[];
const ROUTE_VALUES = zApplicationRoute.options as readonly string[];
const INGEST_VALUES = zIngestMethod.options as readonly string[];

export function parseFilters(searchParams: URLSearchParams): OpportunityFilter {
  const arr = (k: string) => searchParams.getAll(k).flatMap((v) => v.split(",")).filter(Boolean);
  // Keep only values that are valid enum members so a hand-crafted querystring
  // can't push an invalid value into a Prisma `{ in: [...] }` filter.
  const keep = (k: string, allowed: readonly string[]) => arr(k).filter((v) => allowed.includes(v));
  const num = (k: string) => {
    const v = searchParams.get(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };
  const bool = (k: string) => {
    const v = searchParams.get(k);
    return v == null ? undefined : v === "true";
  };
  return {
    q: searchParams.get("q") || undefined,
    workspace: ["DK", "GLOBAL"].includes(searchParams.get("workspace") || "")
      ? (searchParams.get("workspace") as "DK" | "GLOBAL")
      : undefined,
    status: keep("status", STATUS_VALUES) as OpportunityFilter["status"],
    source: arr("source"),
    category: arr("category"),
    tags: arr("tags"),
    country: searchParams.get("country") || undefined,
    region: searchParams.get("region") || undefined,
    budgetMin: num("budgetMin"),
    budgetMax: num("budgetMax"),
    hasBudget: bool("hasBudget"),
    deadlineFrom: searchParams.get("deadlineFrom") || undefined,
    deadlineTo: searchParams.get("deadlineTo") || undefined,
    activeOnly: bool("activeOnly"),
    scoreMin: num("scoreMin"),
    scoreMax: num("scoreMax"),
    applicationRoute: keep("applicationRoute", ROUTE_VALUES) as OpportunityFilter["applicationRoute"],
    ingestMethod: keep("ingestMethod", INGEST_VALUES) as OpportunityFilter["ingestMethod"],
    sort: (searchParams.get("sort") as OpportunityFilter["sort"]) || "score",
    order: (searchParams.get("order") as "asc" | "desc") || "desc",
    page: num("page") || 1,
    pageSize: num("pageSize") || 25,
  };
}
