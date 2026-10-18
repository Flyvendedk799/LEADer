"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Target, Plus } from "lucide-react";
import { workspaceFromRoute } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import { isNavActive, PRIMARY_NAV, TOOLS_NAV, SETTINGS_NAV } from "./nav";
import { useNavCounts, type NavCounts } from "./use-nav-counts";

export interface SidebarProps {
  initialCounts?: NavCounts | null;
}

export const Sidebar: React.FC<SidebarProps> = function Sidebar({
  initialCounts,
} = {}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const workspace = workspaceFromRoute(pathname, params);
  const isActive = (href: string) => isNavActive(pathname, href);
  const counts = useNavCounts(workspace, initialCounts);

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card px-4 py-6 md:flex">
      <Link
        href={`/?workspace=${workspace}`}
        className="mb-8 flex items-center gap-2 px-2"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Target className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-xl font-bold tracking-tight">
            LEADer<span className="text-primary">.</span>
          </div>
          <div className="text-[10px] tracking-wide text-muted-foreground">
            Your next opportunity
          </div>
        </div>
      </Link>

      <Link
        href={`/deals?workspace=${workspace}&new=1`}
        className="mb-7 flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium hover:border-primary/50"
      >
        <Plus className="h-4 w-4" />
        New deal
      </Link>
      <nav
        aria-label="Main navigation"
        className="flex flex-1 flex-col gap-1 overflow-y-auto"
      >
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
          Workspace
        </p>
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const showLeads = item.href === "/inbox" && counts && counts.unreviewedLeads > 0;
          const showTasks = item.href === "/tasks" && counts && counts.openTasks > 0;

          return (
            <Link
              key={item.href}
              href={`${item.href}?workspace=${workspace}`}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
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
          Tools & resources
        </div>
        {TOOLS_NAV.map((item) => (
          <Link
            key={item.href}
            href={`${item.href}?workspace=${workspace}`}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <Link
        href={SETTINGS_NAV.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive(SETTINGS_NAV.href)
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <SETTINGS_NAV.icon className="h-4 w-4" />
        {SETTINGS_NAV.label}
      </Link>
    </aside>
  );
}
