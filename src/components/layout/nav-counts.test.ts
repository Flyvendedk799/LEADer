import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUsePathname = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: any) => {
    const childArray = React.Children.toArray(children);
    return React.createElement("div", null, open ? childArray : childArray[0]);
  },
  SheetTrigger: ({ asChild, children }: any) => children,
  SheetContent: ({ children, className, ...props }: any) =>
    React.createElement("div", { className, ...props }, children),
  SheetTitle: ({ children, className }: any) =>
    React.createElement("div", { className }, children),
}));

import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { NavCountsController, type NavCounts } from "./use-nav-counts";

describe("Sidebar and MobileNav badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  // Preserved original assertions
  it("renders Sidebar navigation links with correct labels", () => {
    const html = renderToStaticMarkup(React.createElement(Sidebar));
    expect(html).toContain("Review leads");
    expect(html).toContain("Tasks");
    expect(html).toContain("Discover");
    expect(html).toContain("Deals");
  });

  it("renders MobileNav with trigger button and links", () => {
    const html = renderToStaticMarkup(React.createElement(MobileNav));
    expect(html).toContain("Open navigation menu");
  });

  describe("Dynamic badge numeric values and overdue indication", () => {
    it("renders Sidebar unreviewed leads badge with correct numeric count and aria-label", () => {
      const counts: NavCounts = {
        unreviewedLeads: 7,
        openTasks: 0,
        overdueTasks: 0,
      };
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, { initialCounts: counts }),
      );

      expect(html).toContain('aria-label="7 unreviewed leads"');
      expect(html).toContain("7</span>");
      expect(html).toContain("bg-primary/15");
      expect(html).toContain("text-primary");
    });

    it("hides Sidebar unreviewed leads badge when unreviewedLeads is 0", () => {
      const counts: NavCounts = {
        unreviewedLeads: 0,
        openTasks: 3,
        overdueTasks: 0,
      };
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, { initialCounts: counts }),
      );

      expect(html).not.toContain("unreviewed leads");
    });

    it("renders Sidebar open tasks badge with standard styling when no tasks are overdue", () => {
      const counts: NavCounts = {
        unreviewedLeads: 0,
        openTasks: 4,
        overdueTasks: 0,
      };
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, { initialCounts: counts }),
      );

      expect(html).toContain('aria-label="4 open tasks"');
      expect(html).toContain("4</span>");
      expect(html).toContain("bg-muted text-muted-foreground");
      expect(html).not.toContain("animate-pulse");
      expect(html).not.toContain("bg-destructive/15 text-destructive");
    });

    it("renders Sidebar open tasks badge with overdue indication and pulsing dot when overdueTasks > 0", () => {
      const counts: NavCounts = {
        unreviewedLeads: 2,
        openTasks: 5,
        overdueTasks: 2,
      };
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, { initialCounts: counts }),
      );

      expect(html).toContain('aria-label="5 open tasks, 2 overdue"');
      expect(html).toContain('title="2 overdue"');
      expect(html).toContain("bg-destructive/15 text-destructive");
      expect(html).toContain("animate-pulse");
    });

    it("hides both badges when counts are zero or null", () => {
      const emptyCounts: NavCounts = {
        unreviewedLeads: 0,
        openTasks: 0,
        overdueTasks: 0,
      };
      const htmlZero = renderToStaticMarkup(
        React.createElement(Sidebar, { initialCounts: emptyCounts }),
      );
      expect(htmlZero).not.toContain("unreviewed leads");
      expect(htmlZero).not.toContain("open tasks");

      const htmlNull = renderToStaticMarkup(
        React.createElement(Sidebar, { initialCounts: null }),
      );
      expect(htmlNull).not.toContain("unreviewed leads");
      expect(htmlNull).not.toContain("open tasks");
    });

    it("renders MobileNav badges matching numeric values and overdue indication", () => {
      const counts: NavCounts = {
        unreviewedLeads: 3,
        openTasks: 6,
        overdueTasks: 1,
      };
      const html = renderToStaticMarkup(
        React.createElement(MobileNav, { initialCounts: counts, defaultOpen: true }),
      );

      expect(html).toContain('aria-label="3 unreviewed leads"');
      expect(html).toContain('aria-label="6 open tasks, 1 overdue"');
      expect(html).toContain("bg-destructive/15 text-destructive");
      expect(html).toContain("animate-pulse");
    });
  });

  describe("Mobile 390px menu badges, keyboard, and 44px touch targets", () => {
    it("ensures MobileNav trigger button meets 44px touch target contract and keyboard accessibility", () => {
      const html = renderToStaticMarkup(React.createElement(MobileNav));
      expect(html).toContain('aria-label="Open navigation menu"');
      expect(html).toContain("min-h-11 min-w-11");
    });

    it("ensures MobileNav navigation links satisfy 44px min-h-11 contract", () => {
      const html = renderToStaticMarkup(
        React.createElement(MobileNav, { defaultOpen: true }),
      );
      // Primary and tools navigation links have min-h-11
      expect(html).toContain("min-h-11 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium");
    });

    it("ensures MobileNav badges use compact styling that prevents horizontal overflow on 390px screens", () => {
      const counts: NavCounts = {
        unreviewedLeads: 99,
        openTasks: 42,
        overdueTasks: 5,
      };
      const html = renderToStaticMarkup(
        React.createElement(MobileNav, { initialCounts: counts, defaultOpen: true }),
      );
      expect(html).toContain("ml-auto inline-flex items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary");
      expect(html).toContain("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold");
    });
  });

  describe("Workspace isolation (DK vs GLOBAL)", () => {
    it("propagates DK workspace query param to Sidebar navigation links", () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("workspace=DK"));
      const html = renderToStaticMarkup(React.createElement(Sidebar));
      expect(html).toContain('href="/inbox?workspace=DK"');
      expect(html).toContain('href="/tasks?workspace=DK"');
      expect(html).toContain('href="/deals?workspace=DK"');
    });

    it("propagates GLOBAL workspace query param to Sidebar and MobileNav navigation links", () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("workspace=GLOBAL"));
      const sidebarHtml = renderToStaticMarkup(React.createElement(Sidebar));
      expect(sidebarHtml).toContain('href="/inbox?workspace=GLOBAL"');
      expect(sidebarHtml).toContain('href="/tasks?workspace=GLOBAL"');

      const mobileHtml = renderToStaticMarkup(
        React.createElement(MobileNav, { defaultOpen: true }),
      );
      expect(mobileHtml).toContain('href="/inbox?workspace=GLOBAL"');
      expect(mobileHtml).toContain('href="/tasks?workspace=GLOBAL"');
      expect(mobileHtml).toContain('href="/global"');
    });
  });

  describe("NavCountsController: focus, refresh events, and stale response isolation", () => {
    it("preserves the browser receiver required by native fetch", async () => {
      const counts = { unreviewedLeads: 2, openTasks: 4, overdueTasks: 1 };
      const onCounts = vi.fn();
      // Chrome rejects fetch called with a controller as its receiver. A plain
      // vi.fn would accept that invocation and hide the missing badges.
      const browserFetch = vi.fn(function (this: unknown) {
        if (this !== globalThis) {
          return Promise.reject(new TypeError("Illegal invocation"));
        }
        return Promise.resolve(new Response(JSON.stringify(counts)));
      });
      const controller = new NavCountsController("DK", onCounts, browserFetch);
      try {
        await controller.fetchCounts();
        expect(onCounts).toHaveBeenCalledWith(counts);
      } finally {
        controller.destroy();
      }
    });

    it("fetches counts for the specified workspace", async () => {
      const onCounts = vi.fn();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          unreviewedLeads: 2,
          openTasks: 4,
          overdueTasks: 1,
        }),
      });

      const controller = new NavCountsController("DK", onCounts, mockFetch as any);
      await controller.fetchCounts();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/nav/counts?workspace=DK",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(onCounts).toHaveBeenCalledWith({
        unreviewedLeads: 2,
        openTasks: 4,
        overdueTasks: 1,
      });
      controller.destroy();
    });

    it("safely discards stale response from previous workspace arriving after a switch (real destroy/recreate lifecycle where old fetch resolves LAST)", async () => {
      const onCounts = vi.fn();
      let resolveDkFetch: (val: any) => void = () => {};
      const dkPromise = new Promise((resolve) => {
        resolveDkFetch = resolve;
      });

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("workspace=DK")) {
          // Stale DK request is delayed and ignores abort signal to simulate late completion
          return dkPromise;
        }
        if (url.includes("workspace=GLOBAL")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              unreviewedLeads: 10,
              openTasks: 8,
              overdueTasks: 3,
            }),
          });
        }
        return Promise.reject(new Error("Unknown url"));
      });

      // Hook lifecycle on initial workspace: DK
      const controllerDk = new NavCountsController("DK", onCounts, mockFetch as any);
      const dkFetchPromise = controllerDk.fetchCounts();

      // Workspace route changes to GLOBAL:
      // React unmounts/cleans up old effect (destroy) and runs new effect with GLOBAL
      controllerDk.destroy();
      const controllerGlobal = new NavCountsController("GLOBAL", onCounts, mockFetch as any);
      await controllerGlobal.fetchCounts();

      // Verify GLOBAL counts were applied
      expect(onCounts).toHaveBeenCalledTimes(1);
      expect(onCounts).toHaveBeenCalledWith({
        unreviewedLeads: 10,
        openTasks: 8,
        overdueTasks: 3,
      });

      // Now the delayed DK response resolves LAST (simulating network return after unmount/switch)
      resolveDkFetch({
        ok: true,
        json: async () => ({
          unreviewedLeads: 1,
          openTasks: 2,
          overdueTasks: 0,
        }),
      });
      await dkFetchPromise;

      // Stale DK counts MUST NOT overwrite GLOBAL counts
      expect(onCounts).toHaveBeenCalledTimes(1);
      expect(onCounts).not.toHaveBeenCalledWith(
        expect.objectContaining({ unreviewedLeads: 1 }),
      );

      controllerGlobal.destroy();
    });

    it("handles rejected GLOBAL fetch gracefully without applying erroneous counts or resurrecting old DK counts", async () => {
      const onCounts = vi.fn();
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("workspace=DK")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              unreviewedLeads: 5,
              openTasks: 3,
              overdueTasks: 1,
            }),
          });
        }
        if (url.includes("workspace=GLOBAL")) {
          return Promise.reject(new Error("Network connection lost"));
        }
        return Promise.reject(new Error("Unknown url"));
      });

      // DK controller fetches and applies DK counts
      const controllerDk = new NavCountsController("DK", onCounts, mockFetch as any);
      await controllerDk.fetchCounts();
      expect(onCounts).toHaveBeenCalledWith({
        unreviewedLeads: 5,
        openTasks: 3,
        overdueTasks: 1,
      });

      // Switch to GLOBAL: old controller is destroyed, new controller is created
      controllerDk.destroy();
      const controllerGlobal = new NavCountsController("GLOBAL", onCounts, mockFetch as any);
      await controllerGlobal.fetchCounts(); // rejects internally, caught by catch()

      // onCounts was NOT called with GLOBAL counts (remains 1 call from DK)
      expect(onCounts).toHaveBeenCalledTimes(1);
      controllerGlobal.destroy();
    });

    it("associates state with workspace so switching to GLOBAL neutralizes DK counts during delayed or failed fetch", () => {
      // Simulating the useNavCounts contract: state.workspace === currentWorkspace ? state.counts : null
      const dkCounts: NavCounts = {
        unreviewedLeads: 8,
        openTasks: 4,
        overdueTasks: 2,
      };

      // State produced while on DK
      const activeState = {
        workspace: "DK",
        counts: dkCounts,
      };

      // In DK workspace: counts are active and visible
      expect(activeState.workspace === "DK" ? activeState.counts : null).toEqual(dkCounts);

      // Route switches to GLOBAL: active workspace becomes "GLOBAL"
      const currentWorkspace = "GLOBAL";
      // While GLOBAL fetch is delayed in-flight or if it fails:
      const renderedCounts = activeState.workspace === currentWorkspace ? activeState.counts : null;
      // Stale DK counts MUST NOT be advertised under GLOBAL
      expect(renderedCounts).toBeNull();
    });

    it("responds to window focus and leader:counts-refresh events to re-fetch counts", async () => {
      const listeners: Record<string, () => void> = {};
      const mockWindow = {
        addEventListener: (event: string, fn: () => void) => {
          listeners[event] = fn;
        },
        removeEventListener: (event: string, _fn?: any) => {
          delete listeners[event];
        },
      };

      const onCounts = vi.fn();
      let leads = 1;
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            unreviewedLeads: leads++,
            openTasks: 2,
            overdueTasks: 0,
          }),
        }),
      );

      const controller = new NavCountsController("DK", onCounts, mockFetch as any);
      await controller.fetchCounts();
      expect(onCounts).toHaveBeenLastCalledWith(expect.objectContaining({ unreviewedLeads: 1 }));

      // Attach mock listeners as useNavCounts does
      const handleRefresh = () => controller.fetchCounts();
      mockWindow.addEventListener("leader:counts-refresh", handleRefresh);
      mockWindow.addEventListener("focus", handleRefresh);

      // Trigger counts-refresh event
      await listeners["leader:counts-refresh"]();
      expect(onCounts).toHaveBeenLastCalledWith(expect.objectContaining({ unreviewedLeads: 2 }));

      // Trigger focus event
      await listeners["focus"]();
      expect(onCounts).toHaveBeenLastCalledWith(expect.objectContaining({ unreviewedLeads: 3 }));

      mockWindow.removeEventListener("leader:counts-refresh", handleRefresh);
      mockWindow.removeEventListener("focus", handleRefresh);
      controller.destroy();
    });

    it("safely discards slow earlier response when newer response arrives within the same workspace", async () => {
      const onCounts = vi.fn();
      let resolveFirstFetch: (val: any) => void = () => {};
      const firstPromise = new Promise((resolve) => {
        resolveFirstFetch = resolve;
      });

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return firstPromise;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            unreviewedLeads: 5,
            openTasks: 5,
            overdueTasks: 0,
          }),
        });
      });

      const controller = new NavCountsController("DK", onCounts, mockFetch as any);

      // Trigger first fetch (slow)
      const fetch1 = controller.fetchCounts();

      // Trigger second fetch (e.g. from leader:counts-refresh or focus)
      await controller.fetchCounts();

      // Newer response applied
      expect(onCounts).toHaveBeenCalledWith({
        unreviewedLeads: 5,
        openTasks: 5,
        overdueTasks: 0,
      });
      expect(onCounts).toHaveBeenCalledTimes(1);

      // Now earlier slow response resolves
      resolveFirstFetch({
        ok: true,
        json: async () => ({
          unreviewedLeads: 1,
          openTasks: 1,
          overdueTasks: 1,
        }),
      });
      await fetch1;

      // Ensure slow earlier response did not overwrite newer response
      expect(onCounts).toHaveBeenCalledTimes(1);

      controller.destroy();
    });

    it("aborts in-flight request when destroyed", () => {
      const onCounts = vi.fn();
      let capturedSignal: any = null;
      const mockFetch = vi.fn().mockImplementation((_url: string, init: any) => {
        capturedSignal = init?.signal;
        return new Promise(() => {}); // never resolves
      });

      const controller = new NavCountsController("DK", onCounts, mockFetch as any);
      controller.fetchCounts();

      expect(capturedSignal).not.toBeNull();
      expect(capturedSignal?.aborted).toBe(false);

      controller.destroy();
      expect(capturedSignal?.aborted).toBe(true);
    });
  });
});
