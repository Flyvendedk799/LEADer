const FILTER_KEYS = [
  "q",
  "workspace",
  "status",
  "source",
  "category",
  "tags",
  "country",
  "region",
  "budgetMin",
  "budgetMax",
  "hasBudget",
  "deadlineFrom",
  "deadlineTo",
  "activeOnly",
  "scoreMin",
  "scoreMax",
  "applicationRoute",
  "ingestMethod",
  "sort",
  "order",
  "page",
  "pageSize",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

type SavedSearchDiscoveryPayloadInput = {
  laneId: string;
  name: string;
};

export type SavedSearchDiscoveryPayload = {
  laneId: string;
  query: string;
  freeformBrief: string;
  useAiPlanner: boolean;
  searchMode: "focused" | "balanced" | "wide";
  queryCount: number;
  requiredTerms: string[];
  excludedTerms: string[];
  workspace: "DK" | "GLOBAL";
  maxResults: number;
  includeWeb: boolean;
  includeSources: boolean;
  provider: "auto" | "tavily" | "brave" | "serper" | "none";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valuesFor(raw: Record<string, unknown>, key: FilterKey): string[] {
  const value = raw[key];
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setParam(params: URLSearchParams, key: FilterKey, values: string[]) {
  if (values.length === 0) return;
  params.set(key, values.join(","));
}

export function savedSearchFiltersToHref(raw: unknown): string {
  const filters = isRecord(raw) ? raw : {};
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    setParam(params, key, valuesFor(filters, key));
  }
  const qs = params.toString();
  return qs ? `/opportunities?${qs}` : "/opportunities";
}

export function describeSavedSearchFilters(raw: unknown): string {
  const filters = isRecord(raw) ? raw : {};
  const parts: string[] = [];
  const q = valuesFor(filters, "q")[0];
  const workspace = valuesFor(filters, "workspace")[0];
  const status = valuesFor(filters, "status");
  const category = valuesFor(filters, "category");
  const scoreMin = valuesFor(filters, "scoreMin")[0];
  const hasBudget = valuesFor(filters, "hasBudget")[0];
  const activeOnly = valuesFor(filters, "activeOnly")[0];

  if (q) parts.push(`"${q}"`);
  if (workspace) parts.push(workspace);
  if (status.length) parts.push(status.join(", "));
  if (category.length) parts.push(category.join(", "));
  if (scoreMin) parts.push(`score >= ${scoreMin}`);
  if (hasBudget === "true") parts.push("has budget");
  if (activeOnly === "true") parts.push("active only");
  return parts.length ? parts.join(" - ") : "All opportunities";
}

function cleanTerm(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function uniqueTerms(values: string[], limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const term = cleanTerm(value);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= limit) break;
  }
  return out;
}

export function savedSearchDiscoveryPayload(
  raw: unknown,
  input: SavedSearchDiscoveryPayloadInput,
): SavedSearchDiscoveryPayload {
  const filters = isRecord(raw) ? raw : {};
  const query = cleanTerm(valuesFor(filters, "q")[0] ?? input.name);
  const workspace: SavedSearchDiscoveryPayload["workspace"] =
    valuesFor(filters, "workspace")[0] === "GLOBAL" ? "GLOBAL" : "DK";
  const requiredTerms = uniqueTerms(
    [
      ...valuesFor(filters, "category"),
      ...valuesFor(filters, "tags"),
      ...valuesFor(filters, "country"),
      ...valuesFor(filters, "region"),
    ],
    8,
  );
  const scoreMin = Number(valuesFor(filters, "scoreMin")[0] ?? 0);
  const activeOnly = valuesFor(filters, "activeOnly")[0] === "true";
  const searchMode: SavedSearchDiscoveryPayload["searchMode"] = activeOnly || scoreMin >= 70 ? "focused" : "balanced";
  const summary = describeSavedSearchFilters(raw);
  const freeformBrief = [
    `Run discovery from saved opportunity search "${input.name}".`,
    `Saved filters: ${summary}.`,
    "Find fresh matching opportunities, tenders, vouchers, buyers, and public sources.",
  ].join(" ").slice(0, 1200);

  return {
    laneId: input.laneId,
    query: [query, ...requiredTerms].filter(Boolean).join(" ").slice(0, 500),
    freeformBrief,
    useAiPlanner: true,
    searchMode,
    queryCount: 4,
    requiredTerms,
    excludedTerms: [],
    workspace,
    maxResults: 12,
    includeWeb: true,
    includeSources: true,
    provider: "auto",
  };
}
