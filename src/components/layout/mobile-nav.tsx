"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { workspaceFromRoute } from "@/lib/workspace-context";
import { Menu, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  GLOBAL_NAV,
  isNavActive,
  PRIMARY_NAV,
  TOOLS_NAV,
  SETTINGS_NAV,
} from "./nav";

type NavCounts = {
  unreviewedLeads: number;
  openTasks: number;
  overdueTasks: number;
};

/**
 * Mobile navigation drawer. The desktop sidebar is hidden below `md`, so this
 * hamburger + slide-in Sheet is the only way to move between sections on phones.
 * Mirrors the sidebar's nav (shared config in ./nav) and closes on navigation.
 */
export function MobileNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const workspace = workspaceFromRoute(pathname, params);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<NavCounts | null>(null);

  // Close the drawer after the route changes (i.e. once a link has been tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;

    function fetchCounts() {
      fetch(`/api/nav/counts?workspace=${encodeURIComponent(workspace)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: NavCounts | null) => {
          if (active && data) {
            setCounts(data);
          }
        })
        .catch(() => {});
    }

    fetchCounts();

    window.addEventListener("leader:counts-refresh", fetchCounts);
    window.addEventListener("focus", fetchCounts);

    return () => {
      active = false;
      window.removeEventListener("leader:counts-refresh", fetchCounts);
      window.removeEventListener("focus", fetchCounts);
    };
  }, [workspace]);

  const linkClass = (href: string, accent = false) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
      isNavActive(pathname, href)
        ? accent
          ? "bg-accent/15 text-accent"
          : "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
    );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className="md:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        <Link href="/" className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Target className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">LEADer</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Lead intelligence
            </div>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {[...PRIMARY_NAV, ...TOOLS_NAV].map((item) => {
            const Icon = item.icon;
            const showLeads = item.href === "/inbox" && counts && counts.unreviewedLeads > 0;
            const showTasks = item.href === "/tasks" && counts && counts.openTasks > 0;

            return (
              <Link
                key={item.href}
                href={`${item.href}?workspace=${workspace}`}
                onClick={() => setOpen(false)}
                className={linkClass(item.href)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {showLeads && (
                  <span
                    aria-label={`${counts.unreviewedLeads} unreviewed leads`}
                    className="ml-auto inline-flex items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
                  >
                    {counts.unreviewedLeads}
                  </span>
                )}
                {showTasks && (
                  <span
                    aria-label={`${counts.openTasks} open tasks${counts.overdueTasks > 0 ? `, ${counts.overdueTasks} overdue` : ""}`}
                    title={counts.overdueTasks > 0 ? `${counts.overdueTasks} overdue` : undefined}
                    className={cn(
                      "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                      counts.overdueTasks > 0
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {counts.overdueTasks > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                    )}
                    {counts.openTasks}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="my-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            International
          </div>
          <Link
            href={GLOBAL_NAV.href}
            className={linkClass(GLOBAL_NAV.href, true)}
          >
            <GLOBAL_NAV.icon className="h-4 w-4" />
            {GLOBAL_NAV.label}
          </Link>
        </nav>

        <div className="px-3 pb-4">
          <Link
            href={SETTINGS_NAV.href}
            className={linkClass(SETTINGS_NAV.href)}
          >
            <SETTINGS_NAV.icon className="h-4 w-4" />
            {SETTINGS_NAV.label}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
