import type { Workspace } from "@/lib/types";

type WorkspaceSearchParams =
  | Pick<URLSearchParams, "get">
  | Record<string, string | string[] | undefined>
  | string
  | null
  | undefined;

export function workspaceLabel(workspace: Workspace): string {
  return workspace === "GLOBAL" ? "International" : "Denmark";
}

export function normalizeWorkspace(value: unknown): Workspace | null {
  return value === "GLOBAL" || value === "DK" ? value : null;
}

function workspaceFromSearchParams(searchParams?: WorkspaceSearchParams): Workspace | null {
  if (!searchParams) return null;
  if (typeof searchParams === "string") {
    const normalized = searchParams.startsWith("?") ? searchParams.slice(1) : searchParams;
    return normalizeWorkspace(new URLSearchParams(normalized).get("workspace"));
  }
  if (typeof (searchParams as Pick<URLSearchParams, "get">).get === "function") {
    return normalizeWorkspace((searchParams as Pick<URLSearchParams, "get">).get("workspace"));
  }
  const raw = (searchParams as Record<string, string | string[] | undefined>).workspace;
  return normalizeWorkspace(Array.isArray(raw) ? raw[0] : raw);
}

export function workspaceFromRoute(
  pathname?: string | null,
  searchParams?: WorkspaceSearchParams,
): Workspace {
  const explicit = workspaceFromSearchParams(searchParams);
  if (explicit) return explicit;
  return pathname === "/global" || pathname?.startsWith("/global/") ? "GLOBAL" : "DK";
}
