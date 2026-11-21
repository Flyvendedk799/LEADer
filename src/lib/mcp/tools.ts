// MCP tools for LEADer. Every tool is a thin call to LEADer's own HTTP API made
// with the caller's API token, so ownership checks, validation and side effects
// are exactly those of the routes the web app uses.

export type ApiCall = (
  method: string,
  path: string,
  init?: { query?: Record<string, unknown>; body?: unknown },
) => Promise<{ status: number; data: unknown }>;

type JsonSchema = Record<string, unknown>;
type Args = Record<string, unknown>;

export interface LeaderTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly?: boolean;
  run: (args: Args, api: ApiCall) => Promise<unknown>;
}

const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description, ...extra });
const int = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "integer", description, ...extra });
const bool = (description: string): JsonSchema => ({ type: "boolean", description });
const strings = (description: string): JsonSchema => ({ type: "array", items: { type: "string" }, description });
const enumOf = (values: string[], description: string): JsonSchema => ({ type: "string", enum: values, description });

export class ToolError extends Error {}

/** Unwraps an API response, turning HTTP errors into tool errors. */
async function call(api: ApiCall, method: string, path: string, init?: Parameters<ApiCall>[2]) {
  const res = await api(method, path, init);
  if (res.status >= 400) {
    throw new ToolError(`${method} ${path} → HTTP ${res.status}: ${typeof res.data === "string" ? res.data : JSON.stringify(res.data)}`);
  }
  return res.data;
}

const pick = (args: Args, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => args[k] !== undefined && args[k] !== null).map((k) => [k, args[k]]));

const enc = (v: unknown) => encodeURIComponent(String(v));

/** Accepts a lane id or slug and returns the lane id. */
async function laneId(api: ApiCall, idOrSlug: unknown) {
  const lane = (await call(api, "GET", `/api/ops/lanes/${enc(idOrSlug)}`)) as { id: string };
  return lane.id;
}

export const LEADER_TOOLS: LeaderTool[] = [
  {
    name: "leader_overview",
    readOnly: true,
    description:
      "Health and state of LEADer in one call: worker heartbeat, search/AI provider readiness, today's and this month's usage against the allowances, candidate/mission/deal counts, lanes, the 15 most recent discovery missions with warnings and log tail, recent workflow runs and source scan status. Start here when debugging.",
    inputSchema: obj({}),
    run: (_a, api) => call(api, "GET", "/api/ops/overview"),
  },
  {
    name: "leader_list_candidates",
    readOnly: true,
    description:
      "List discovery candidates (leads awaiting review) with scores, reasons, source and lane. Sorted by pursuit score unless sort=recent.",
    inputSchema: obj({
      status: str("Comma-separated statuses: NEW, REVIEWED, SAVED, DISMISSED, DUPLICATE. Default: all."),
      lane: str("Lane slug, e.g. tenders-procurement"),
      missionId: str("Only candidates found by this discovery mission"),
      q: str("Case-insensitive text search over title, description, organization, url, source"),
      minScore: int("Minimum pursuit score (0-100)"),
      workspace: enumOf(["DK", "GLOBAL"], "Workspace"),
      sort: enumOf(["score", "recent"], "Sort order (default score)"),
      limit: int("Max rows (1-200, default 50)"),
      offset: int("Rows to skip"),
    }),
    run: (a, api) =>
      call(api, "GET", "/api/ops/candidates", { query: pick(a, ["status", "lane", "missionId", "q", "minScore", "workspace", "sort", "limit", "offset"]) }),
  },
  {
    name: "leader_get_candidate",
    readOnly: true,
    description: "Full candidate: raw page content, score breakdown, every evidence item with provenance, its mission, lane, deal and account.",
    inputSchema: obj({ id: str("Candidate id") }, ["id"]),
    run: (a, api) => call(api, "GET", `/api/ops/candidates/${enc(a.id)}`),
  },
  {
    name: "leader_review_candidate",
    description:
      "Act on one candidate exactly as the Review screen does. save = create account+deal+follow-up task; dismiss/duplicate/review change status; snooze hides it 7 days; restore returns it to NEW; feedback stores structured feedback; edit applies corrections (pass `changes`, title required).",
    inputSchema: obj(
      {
        id: str("Candidate id"),
        action: enumOf(["save", "dismiss", "duplicate", "review", "snooze", "restore", "feedback", "edit"], "Action"),
        reason: str("Why (stored as dismissal reason; used for learning)"),
        feedback: { type: "object", description: "Structured feedback object for action=feedback" },
        changes: { type: "object", description: "For action=edit: {title, organization, url, deadline, budgetMin, budgetMax, currency, applicationRoute}" },
      },
      ["id", "action"],
    ),
    run: (a, api) => call(api, "PATCH", `/api/discovery/candidates/${enc(a.id)}`, { body: pick(a, ["action", "reason", "feedback", "changes"]) }),
  },
  {
    name: "leader_bulk_candidates",
    description: "Apply review/save/dismiss/duplicate to up to 100 candidates at once.",
    inputSchema: obj(
      { ids: strings("Candidate ids"), action: enumOf(["review", "save", "dismiss", "duplicate"], "Action"), reason: str("Reason") },
      ["ids", "action"],
    ),
    run: (a, api) => call(api, "POST", "/api/discovery/candidates/bulk", { body: pick(a, ["ids", "action", "reason"]) }),
  },
  {
    name: "leader_list_lanes",
    readOnly: true,
    description: "All discovery lanes with their query templates, positive/negative keywords, evidence requirements and scoring config.",
    inputSchema: obj({}),
    run: (_a, api) => call(api, "GET", "/api/discovery/lanes"),
  },
  {
    name: "leader_update_lane",
    description:
      "Tune a discovery lane (by id or slug). Only the fields you pass change; array fields replace the whole list, so read the lane first.",
    inputSchema: obj(
      {
        lane: str("Lane id or slug"),
        name: str("Display name"),
        description: str("What the lane is looking for (fed to the AI planner and gate)"),
        active: bool("Whether the scheduler runs this lane"),
        queryTemplates: strings("Search query templates"),
        positiveKeywords: strings("Terms that raise the match score"),
        negativeKeywords: strings("Terms that reject or lower a candidate"),
        evidenceRequirements: strings("Evidence a candidate must show"),
        conversionGuidance: { type: ["string", "null"], description: "How to turn a hit into a deal" },
        scoringConfig: { type: ["object", "null"], description: "Numeric scoring weights, or null to clear" },
      },
      ["lane"],
    ),
    run: async (a, api) => {
      const { lane, ...patch } = a;
      return call(api, "PATCH", `/api/ops/lanes/${enc(lane)}`, { body: patch });
    },
  },
  {
    name: "leader_create_lane",
    description: "Create a new discovery lane.",
    inputSchema: obj(
      {
        slug: str("lowercase-with-dashes"),
        name: str("Display name"),
        description: str("What the lane looks for"),
        workspace: enumOf(["DK", "GLOBAL"], "Workspace (default DK)"),
        active: bool("Scheduled (default true)"),
        queryTemplates: strings("Search query templates"),
        positiveKeywords: strings("Positive terms"),
        negativeKeywords: strings("Negative terms"),
        evidenceRequirements: strings("Required evidence"),
        conversionGuidance: str("Conversion guidance"),
      },
      ["slug", "name", "description"],
    ),
    run: (a, api) => call(api, "POST", "/api/discovery/lanes", { body: a }),
  },
  {
    name: "leader_run_discovery",
    description:
      "Queue a discovery mission for a lane; the worker executes it. Uses paid search/AI within the allowances in Settings. Returns the mission; poll leader_get_run for progress.",
    inputSchema: obj(
      {
        lane: str("Lane id or slug"),
        query: str("Search query (max 500 chars)"),
        freeformBrief: str("Plain-language brief for the AI planner (max 1200 chars)"),
        useAiPlanner: bool("Let the AI generate search queries (default false)"),
        searchMode: enumOf(["focused", "balanced", "wide"], "Breadth (default balanced)"),
        queryCount: int("Number of search queries 1-8"),
        requiredTerms: strings("Terms every result must contain"),
        excludedTerms: strings("Terms that exclude a result"),
        workspace: enumOf(["DK", "GLOBAL"], "Workspace"),
        maxResults: int("4-30, default 12"),
        includeWeb: bool("Use web search (default true)"),
        includeSources: bool("Scan configured public sources (default true)"),
        provider: enumOf(["auto", "tavily", "brave", "serper", "none"], "Search provider (default auto)"),
      },
      ["lane"],
    ),
    run: async (a, api) => {
      const { lane, ...rest } = a;
      return call(api, "POST", "/api/discovery/runs", { body: { ...rest, laneId: await laneId(api, lane) } });
    },
  },
  {
    name: "leader_list_runs",
    readOnly: true,
    description: "Discovery mission history and the live queue.",
    inputSchema: obj({
      limit: int("20-100"),
      q: str("Search text across mission, log, warnings and candidates"),
      workspace: enumOf(["DK", "GLOBAL"], "Workspace"),
    }),
    run: (a, api) => call(api, "GET", "/api/discovery/runs", { query: pick(a, ["limit", "q", "workspace"]) }),
  },
  {
    name: "leader_get_run",
    readOnly: true,
    description: "One discovery mission with its full log, warnings, checkpoint and candidates (including those hidden by the lane gate).",
    inputSchema: obj({ id: str("Mission id") }, ["id"]),
    run: (a, api) => call(api, "GET", `/api/discovery/runs/${enc(a.id)}`),
  },
  {
    name: "leader_run_action",
    description: "Cancel, rerun or reorder discovery missions. CANCEL_ALL needs no id.",
    inputSchema: obj(
      { action: enumOf(["CANCEL", "CANCEL_ALL", "RERUN", "MOVE_UP", "MOVE_DOWN", "MOVE_TOP"], "Action"), id: str("Mission id") },
      ["action"],
    ),
    run: (a, api) => call(api, "PATCH", "/api/discovery/runs", { body: pick(a, ["action", "id"]) }),
  },
  {
    name: "leader_list_workflow_runs",
    readOnly: true,
    description: "Workflow (automation) run history with status and logs.",
    inputSchema: obj({}),
    run: (_a, api) => call(api, "GET", "/api/workflows/run"),
  },
  {
    name: "leader_run_workflow",
    description:
      "Queue a workflow playbook: daily-sweep (public sources + deal rechecks), candidate-harvest, pipeline-rescue, operating-day, research-brief (options.researchBrief.subject required).",
    inputSchema: obj(
      {
        playbook: enumOf(["daily-sweep", "pipeline-rescue", "candidate-harvest", "operating-day", "research-brief"], "Playbook"),
        workspace: enumOf(["DK", "GLOBAL"], "Workspace (default DK)"),
        options: { type: "object", description: "Playbook options, as accepted by POST /api/workflows/run" },
      },
      ["playbook"],
    ),
    run: (a, api) => call(api, "POST", "/api/workflows/run", { body: pick(a, ["playbook", "workspace", "options"]) }),
  },
  {
    name: "leader_get_settings",
    readOnly: true,
    description: "The owner's settings: company profile (allowances, budgets, discovery hour), preferences, scoring weights and masked AI/search provider config.",
    inputSchema: obj({}),
    run: (_a, api) => call(api, "GET", "/api/settings"),
  },
  {
    name: "leader_update_settings",
    description:
      "Update settings. `companyProfile` is merged into the current profile (e.g. {dailySearchQueries: 60}). Other top-level fields (headline, bio, preferredProjectTypes, excludedCategories, budgetMaxDkk, scoringWeights) replace their current value.",
    inputSchema: obj({
      companyProfile: { type: "object", description: "Partial company profile to merge" },
      headline: str("Headline"),
      bio: str("Bio"),
      preferredProjectTypes: strings("Preferred project types"),
      excludedCategories: strings("Excluded categories"),
      budgetMaxDkk: int("Max budget DKK"),
      scoringWeights: { type: "object", description: "Score weights" },
    }),
    run: async (a, api) => {
      const body: Args = { ...a };
      if (a.companyProfile) {
        const current = (await call(api, "GET", "/api/settings")) as { companyProfile?: Args | null };
        body.companyProfile = { ...(current.companyProfile ?? {}), ...(a.companyProfile as Args) };
      }
      return call(api, "PATCH", "/api/settings", { body });
    },
  },
  {
    name: "leader_list_deals",
    readOnly: true,
    description: "Deals in the pipeline. Query params are passed through (e.g. q, status, attention, workspace).",
    inputSchema: obj({ query: { type: "object", description: "Query string parameters for GET /api/deals" } }),
    run: (a, api) => call(api, "GET", "/api/deals", { query: (a.query as Args) ?? {} }),
  },
  {
    name: "leader_list_tasks",
    readOnly: true,
    description: "Tasks and follow-ups. Query params are passed through (e.g. status=OPEN).",
    inputSchema: obj({ query: { type: "object", description: "Query string parameters for GET /api/tasks" } }),
    run: (a, api) => call(api, "GET", "/api/tasks", { query: (a.query as Args) ?? {} }),
  },
  {
    name: "leader_api",
    description:
      "Call any LEADer API route as the token owner — the escape hatch for everything the other tools don't cover (accounts, people, touchpoints, conversion-assets, sources, imports, exports, alerts, calibration, usage, workflow presets, AI drafting…). Path must start with /api/. See docs/API.md for the route list.",
    inputSchema: obj(
      {
        method: enumOf(["GET", "POST", "PATCH", "PUT", "DELETE"], "HTTP method"),
        path: str("Route path, e.g. /api/sources or /api/deals/abc123"),
        query: { type: "object", description: "Query string parameters" },
        body: { description: "JSON request body" },
      },
      ["method", "path"],
    ),
    run: (a, api) => {
      const path = String(a.path);
      if (!path.startsWith("/api/") || path.startsWith("/api/mcp")) throw new ToolError("path must start with /api/ (and not be /api/mcp)");
      return call(api, String(a.method), path, { query: a.query as Args | undefined, body: a.body });
    },
  },
];
