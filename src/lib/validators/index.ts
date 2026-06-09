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
export const zApplicationRoute = z.enum(["DIRECT", "APPLICATION", "UNKNOWN"]);
export const zIngestMethod = z.enum(["AUTOMATED", "MANUAL", "COMMUNITY"]);
export const zDraftKind = z.enum([
  "SUMMARY", "APPLICATION", "PITCH", "EMAIL", "CHECKLIST", "COMPARISON", "EXPLANATION",
]);
export const zExportFormat = z.enum(["csv", "xlsx", "pdf", "markdown", "notion"]);
export const zAiAction = z.enum([
  "summarize", "extract", "classify", "explainScore", "draftApplication",
  "draftPitch", "draftEmail", "checklist", "compare", "similar", "nextAction",
]);

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
  payload: z.record(z.unknown()).optional(),
  save: z.boolean().optional(), // persist drafts
});

export const exportRequestSchema = z.object({
  format: zExportFormat,
  ids: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  title: z.string().optional(),
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
  aiKeys: z.record(z.unknown()).optional(),
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
    sort: (searchParams.get("sort") as "score" | "deadline" | "created" | "budget") || "score",
    order: (searchParams.get("order") as "asc" | "desc") || "desc",
    page: num("page") || 1,
    pageSize: num("pageSize") || 25,
  };
}
