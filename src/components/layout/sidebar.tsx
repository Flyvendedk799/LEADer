"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardPaste,
  Globe2,
  LayoutDashboard,
  ListChecks,
  Radar,
  Settings,
  Star,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Target, Star, ListChecks, Radar, ClipboardPaste, Settings, Globe2,
};

const NAV = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/opportunities", label: "Opportunities", icon: "Target" },
  { href: "/watchlist", label: "Watchlist", icon: "Star" },
  { href: "/lists", label: "Lists", icon: "ListChecks" },
  { href: "/sources", label: "Sources", icon: "Radar" },
  { href: "/import", label: "Community import", icon: "ClipboardPaste" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface/60 px-3 py-4 md:flex">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Target className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">LEADer</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lead intelligence</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <div className="my-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Global
        </div>
        <Link
          href="/global"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive("/global")
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Globe2 className="h-4 w-4" />
          International
        </Link>
      </nav>

      <Link
        href="/settings"
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive("/settings") ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <Settings className="h-4 w-4" />
        Settings
      </Link>
    </aside>
  );
}
