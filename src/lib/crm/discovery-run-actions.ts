import { discoveryRunCreateSchema } from "@/lib/validators";

const LIVE_DISCOVERY_MISSION_STATUSES = new Set(["QUEUED", "RUNNING"]);

type DiscoveryRunActionInput = {
  laneId: string;
  query?: string | null;
  freeformBrief?: string | null;
  useAiPlanner?: boolean | null;
  searchMode?: string | null;
  queryCount?: number | null;
  requiredTerms?: string[] | null;
  excludedTerms?: string[] | null;
  workspace?: string | null;
  maxResults?: number | null;
  includeWeb?: boolean | null;
  includeSources?: boolean | null;
  provider?: string | null;
};

type DiscoveryMissionIdentityRun = {
  status?: string | null;
  finishedAt?: Date | string | null;
  workspace?: string | null;
  input?: unknown;
};

export function discoveryMissionCanRerun(status?: string | null) {
  return !LIVE_DISCOVERY_MISSION_STATUSES.has(String(status ?? "").toUpperCase());
}

export function discoveryMissionRerunBlockedMessage(status?: string | null) {
  return discoveryMissionCanRerun(status) ? null : "Wait for this discovery mission to finish before rerunning it.";
}

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function cleanTerms(values?: string[] | null) {
  return [...new Set((values ?? []).map(cleanText).filter(Boolean))].sort();
}

function normalizedDiscoveryMissionInput(input: DiscoveryRunActionInput, fallbackWorkspace?: string | null) {
  return {
    laneId: input.laneId,
    query: cleanText(input.query),
    freeformBrief: cleanText(input.freeformBrief),
    useAiPlanner: Boolean(input.useAiPlanner),
    searchMode: input.searchMode ?? "balanced",
    queryCount: input.queryCount ?? null,
    requiredTerms: cleanTerms(input.requiredTerms),
    excludedTerms: cleanTerms(input.excludedTerms),
    workspace: input.workspace ?? fallbackWorkspace ?? "DK",
    maxResults: input.maxResults ?? 12,
    includeWeb: input.includeWeb !== false,
    includeSources: input.includeSources !== false,
    provider: input.provider ?? "auto",
  };
}

export function discoveryMissionInputMatchesActiveRun(
  input: DiscoveryRunActionInput,
  run: DiscoveryMissionIdentityRun,
) {
  if (!LIVE_DISCOVERY_MISSION_STATUSES.has(String(run.status ?? "").toUpperCase()) || run.finishedAt) return false;
  const parsed = discoveryRunCreateSchema.safeParse(run.input ?? {});
  if (!parsed.success) return false;
  const target = normalizedDiscoveryMissionInput(input, run.workspace);
  const active = normalizedDiscoveryMissionInput(parsed.data, run.workspace);
  return JSON.stringify(target) === JSON.stringify(active);
}
