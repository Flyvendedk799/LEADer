"use client";

import { useEffect, useState } from "react";

export interface NavCounts {
  unreviewedLeads: number;
  openTasks: number;
  overdueTasks: number;
}

/**
 * Controller managing nav counts fetching, sequence tracking, and cancellation
 * to prevent race conditions and stale response overwrites.
 */
export class NavCountsController {
  private active = true;
  private requestId = 0;
  private abortController: AbortController | null = null;
  private workspace: string;
  private onCounts: (counts: NavCounts) => void;
  private fetchFn: typeof fetch;

  constructor(
    workspace: string,
    onCounts: (counts: NavCounts) => void,
    fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.workspace = workspace;
    this.onCounts = onCounts;
    this.fetchFn = fetchFn;
  }

  fetchCounts(): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const currentRequestId = ++this.requestId;
    const currentWorkspace = this.workspace;

    return this.fetchFn(
      `/api/nav/counts?workspace=${encodeURIComponent(currentWorkspace)}`,
      { signal: this.abortController.signal },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: NavCounts | null) => {
        if (
          this.active &&
          currentRequestId === this.requestId &&
          currentWorkspace === this.workspace &&
          data
        ) {
          this.onCounts(data);
        }
      })
      .catch(() => {});
  }

  destroy(): void {
    this.active = false;
    this.abortController?.abort();
  }
}

/**
 * React hook subscribing to nav counts for the active workspace.
 * Listens to `leader:counts-refresh` and window `focus` events.
 * Guarantees that stale responses from previous workspaces or slow earlier requests
 * are safely discarded.
 */
export function useNavCounts(
  workspace: string,
  initialCounts: NavCounts | null = null,
): NavCounts | null {
  const [state, setState] = useState<{
    workspace: string;
    counts: NavCounts;
  } | null>(initialCounts ? { workspace, counts: initialCounts } : null);

  useEffect(() => {
    const controller = new NavCountsController(workspace, (counts) => {
      setState({ workspace, counts });
    });
    controller.fetchCounts();

    const handleRefresh = () => {
      controller.fetchCounts();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("leader:counts-refresh", handleRefresh);
      window.addEventListener("focus", handleRefresh);
    }

    return () => {
      controller.destroy();
      if (typeof window !== "undefined") {
        window.removeEventListener("leader:counts-refresh", handleRefresh);
        window.removeEventListener("focus", handleRefresh);
      }
    };
  }, [workspace]);

  return state && state.workspace === workspace ? state.counts : null;
}
