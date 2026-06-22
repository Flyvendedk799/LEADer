"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTheme } from "next-themes";
import {
  Bot,
  CalendarClock,
  ClipboardPaste,
  Compass,
  CornerDownLeft,
  Mail,
  Loader2,
  Moon,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Target,
  TimerReset,
} from "lucide-react";
import { cn, formatBudget } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import { toast } from "@/hooks/use-toast";
import { openPlatformAgent } from "@/components/agent/platform-agent";
import { GLOBAL_NAV, PRIMARY_NAV, SETTINGS_NAV, type NavItem } from "./nav";

const NAV_ALL: NavItem[] = [...PRIMARY_NAV, GLOBAL_NAV, SETTINGS_NAV];

/** Custom event other components (e.g. the topbar button) can fire to open the palette. */
export const COMMAND_EVENT = "leader:command-palette";
export function openCommandPalette() {
  window.dispatchEvent(new Event(COMMAND_EVENT));
}

interface OppHit {
  id: string;
  title: string;
  account: { name: string } | null;
  valueMin: number | null;
  valueMax: number | null;
  currency: string | null;
  pursuitScore: number | null;
}

interface Result {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  score?: number | null;
  perform: () => void | Promise<void>;
}

type WorkflowRunResponse = {
  run?: {
    id: string;
    status: string;
  };
  error?: unknown;
};

type WorkflowPlaybook = "daily-sweep" | "pipeline-rescue" | "candidate-harvest" | "operating-day";

export function CommandPalette() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<OppHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Open via ⌘K / Ctrl+K, or a dispatched COMMAND_EVENT (e.g. topbar button).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_EVENT, onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_EVENT, onEvent);
    };
  }, []);

  // Reset transient state each time the palette opens.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  // Debounced deal search while the palette is open.
  React.useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/deals?q=${encodeURIComponent(term)}&pageSize=6`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { items: OppHit[] };
        setHits(data.items ?? []);
      } catch {
        if (!controller.signal.aborted) setHits([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, open]);

  const close = React.useCallback(() => {
    setOpen(false);
  }, []);

  const generateAlerts = React.useCallback(async (type: "REMINDERS" | "DIGEST", id: string) => {
    setActionId(id);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not run workflow action");
      const created = Number(data?.created ?? 0);
      const emailed = Number(data?.emailed ?? 0);
      toast.success(
        type === "DIGEST" ? "Digest generated" : "Deadlines checked",
        emailed ? `${created} created - ${emailed} emailed` : `${created} created`,
      );
      router.refresh();
      close();
    } catch (err) {
      toast.error("Workflow action failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setActionId(null);
    }
  }, [close, router]);

  const runDailySweep = React.useCallback(async () => {
    const id = "act-daily-sweep";
    setActionId(id);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook: "daily-sweep", workspace: "DK" }),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) throw new Error(String(data?.error || "Could not queue daily sweep"));
      toast.success("Daily sweep queued", "It will keep running in the background.");
      router.refresh();
      close();
    } catch (err) {
      toast.error("Daily sweep failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setActionId(null);
    }
  }, [close, router]);

  const queueWorkflowPlaybook = React.useCallback(async (playbook: WorkflowPlaybook, id: string, label: string) => {
    setActionId(id);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook, workspace: "DK" }),
      });
      const data = (await res.json().catch(() => null)) as WorkflowRunResponse | null;
      if (!res.ok || !data?.run) throw new Error(String(data?.error || `Could not queue ${label.toLowerCase()}`));
      toast.success(`${label} queued`, "It will keep running in the background.");
      router.refresh();
      close();
    } catch (err) {
      toast.error(`${label} failed`, err instanceof Error ? err.message : "Try again");
    } finally {
      setActionId(null);
    }
  }, [close, router]);

  const results = React.useMemo<Result[]>(() => {
    const term = query.trim().toLowerCase();
    const out: Result[] = [];

    // Deals (only when searching) come first — the most specific hits.
    for (const o of hits) {
      out.push({
        id: `opp-${o.id}`,
        group: "Deals",
        label: o.title,
        hint: [o.account?.name, formatBudget(o.valueMin, o.valueMax, o.currency ?? "DKK")]
          .filter(Boolean)
          .join(" · "),
        icon: <Search className="h-4 w-4 text-muted-foreground" />,
        score: o.pursuitScore,
        perform: () => {
          router.push(`/deals/${o.id}`);
          close();
        },
      });
    }

    const navMatches = NAV_ALL.filter((n) => !term || n.label.toLowerCase().includes(term));
    for (const n of navMatches) {
      const Icon = n.icon;
      out.push({
        id: `nav-${n.href}`,
        group: "Go to",
        label: n.label,
        icon: <Icon className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          router.push(n.href);
          close();
        },
      });
    }

    const actions: Result[] = [
      {
        id: "act-new-opportunity",
        group: "Actions",
        label: "New opportunity",
        hint: "Open the creation dialog",
        icon: <Plus className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          router.push("/opportunities?new=1");
          close();
        },
      },
      {
        id: "act-discovery",
        group: "Actions",
        label: "Queue discovery mission",
        hint: "Open mission control",
        icon: <Radar className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          router.push("/discover");
          close();
        },
      },
      {
        id: "act-import",
        group: "Actions",
        label: "Import community lead",
        hint: "Manual paste workflow",
        icon: <ClipboardPaste className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          router.push("/import");
          close();
        },
      },
      {
        id: "act-operating-day",
        group: "Workflow actions",
        label: "Run operating day",
        hint: "Sweep, harvest, rescue",
        icon: <Sparkles className="h-4 w-4 text-muted-foreground" />,
        perform: () => queueWorkflowPlaybook("operating-day", "act-operating-day", "Operating day"),
      },
      {
        id: "act-candidate-harvest",
        group: "Workflow actions",
        label: "Harvest hot candidates",
        hint: "Save top candidates as deals",
        icon: <Target className="h-4 w-4 text-muted-foreground" />,
        perform: () => queueWorkflowPlaybook("candidate-harvest", "act-candidate-harvest", "Candidate harvest"),
      },
      {
        id: "act-pipeline-rescue",
        group: "Workflow actions",
        label: "Run pipeline rescue",
        hint: "Stale deals, deadline prep",
        icon: <TimerReset className="h-4 w-4 text-muted-foreground" />,
        perform: () => queueWorkflowPlaybook("pipeline-rescue", "act-pipeline-rescue", "Pipeline rescue"),
      },
      {
        id: "act-daily-sweep",
        group: "Workflow actions",
        label: "Run daily sweep",
        hint: "Sources, reminders, digest",
        icon: <RefreshCw className="h-4 w-4 text-muted-foreground" />,
        perform: runDailySweep,
      },
      {
        id: "act-deadlines",
        group: "Workflow actions",
        label: "Check deadline reminders",
        hint: "Generate unread alerts",
        icon: <CalendarClock className="h-4 w-4 text-muted-foreground" />,
        perform: () => generateAlerts("REMINDERS", "act-deadlines"),
      },
      {
        id: "act-digest",
        group: "Workflow actions",
        label: "Generate pipeline digest",
        hint: "Create a fresh inbox digest",
        icon: <Mail className="h-4 w-4 text-muted-foreground" />,
        perform: () => generateAlerts("DIGEST", "act-digest"),
      },
      {
        id: "act-workflows",
        group: "Workflow actions",
        label: "Open workflow command",
        hint: "Queues, alerts, sources, candidates",
        icon: <Compass className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          router.push("/workflows");
          close();
        },
      },
      {
        id: "act-agent",
        group: "Agent",
        label: "Open LEADer Agent",
        hint: "Ask or delegate work",
        icon: <Bot className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          openPlatformAgent();
          close();
        },
      },
      {
        id: "act-agent-attention",
        group: "Agent",
        label: "Ask agent what needs attention",
        hint: "Cockpit and queues",
        icon: <Sparkles className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          openPlatformAgent("What needs my attention today?");
          close();
        },
      },
      {
        id: "act-theme",
        group: "Actions",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon:
          theme === "dark" ? (
            <Sun className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Moon className="h-4 w-4 text-muted-foreground" />
          ),
        perform: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          close();
        },
      },
    ];
    for (const a of actions) {
      if (!term || a.label.toLowerCase().includes(term)) out.push(a);
    }

    if (term.length >= 3) {
      out.push({
        id: "act-agent-query",
        group: "Agent",
        label: `Ask agent: ${query.trim()}`,
        hint: "Prefill the agent",
        icon: <Bot className="h-4 w-4 text-muted-foreground" />,
        perform: () => {
          openPlatformAgent(query.trim());
          close();
        },
      });
    }

    return out;
  }, [close, generateAlerts, hits, query, queueWorkflowPlaybook, router, runDailySweep, setTheme, theme]);

  // Keep the active index in range whenever the result set changes.
  React.useEffect(() => {
    setActive((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  // Scroll the active row into view.
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[active];
      if (result && !actionId) void result.perform();
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search opportunities, jump to a page, or run an action.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-border px-3">
            {loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search opportunities or jump to…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[60vh] overflow-y-auto scrollbar-thin p-2">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {query.trim() ? "No matches." : "Type to search…"}
              </p>
            ) : (
              results.map((r, i) => {
                const showHeader = i === 0 || results[i - 1].group !== r.group;
                const isActive = i === active;
                return (
                  <React.Fragment key={r.id}>
                    {showHeader && (
                      <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {r.group}
                      </div>
                    )}
                    <button
                      type="button"
                      data-index={i}
                      onClick={() => {
                        if (!actionId) void r.perform();
                      }}
                      onMouseMove={() => setActive(i)}
                      disabled={Boolean(actionId)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        isActive ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-surface-2",
                      )}
                    >
                      {actionId === r.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : r.icon}
                      <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
                      {r.hint && (
                        <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:inline">
                          {r.hint}
                        </span>
                      )}
                      {r.score != null && <ScoreBadge score={r.score} size="sm" />}
                      {isActive && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
