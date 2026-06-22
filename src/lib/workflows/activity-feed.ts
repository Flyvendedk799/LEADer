export type WorkflowActivityKind = "mission" | "workflow" | "source" | "alert" | "asset" | "opportunity";

export type WorkflowActivityStatusFilter = "all" | "active" | "attention" | "done";

export type WorkflowActivityItem = {
  id: string;
  kind: WorkflowActivityKind;
  title: string;
  description: string | null;
  status: string | null;
  href: string;
  createdAt: string;
};

export type WorkflowActivityFilters = {
  query?: string;
  kind?: WorkflowActivityKind | "all";
  status?: WorkflowActivityStatusFilter;
};

const ACTIVE_STATUSES = new Set(["RUNNING", "QUEUED"]);
const ATTENTION_STATUSES = new Set(["ERROR", "DEADLINE", "NEEDS_ACTION"]);
const DONE_STATUSES = new Set(["SUCCESS", "DONE", "WON"]);

function normalized(value: string | null | undefined) {
  return value?.toLowerCase().trim() ?? "";
}

export function workflowActivityStatusBucket(status: string | null | undefined): Exclude<WorkflowActivityStatusFilter, "all"> | "other" {
  const value = status?.toUpperCase() ?? "";
  if (ACTIVE_STATUSES.has(value)) return "active";
  if (ATTENTION_STATUSES.has(value)) return "attention";
  if (DONE_STATUSES.has(value)) return "done";
  return "other";
}

export function workflowActivityMatches(item: WorkflowActivityItem, filters: WorkflowActivityFilters) {
  const kind = filters.kind ?? "all";
  if (kind !== "all" && item.kind !== kind) return false;

  const status = filters.status ?? "all";
  if (status !== "all" && workflowActivityStatusBucket(item.status) !== status) return false;

  const query = normalized(filters.query);
  if (!query) return true;
  const haystack = [item.title, item.description, item.status, item.kind].map(normalized).join(" ");
  return haystack.includes(query);
}

export function filterWorkflowActivityItems(items: WorkflowActivityItem[], filters: WorkflowActivityFilters) {
  return items.filter((item) => workflowActivityMatches(item, filters));
}

export function workflowActivityKindCounts(items: WorkflowActivityItem[]) {
  return items.reduce<Record<WorkflowActivityKind, number>>(
    (counts, item) => {
      counts[item.kind] += 1;
      return counts;
    },
    {
      mission: 0,
      workflow: 0,
      source: 0,
      alert: 0,
      asset: 0,
      opportunity: 0,
    },
  );
}
