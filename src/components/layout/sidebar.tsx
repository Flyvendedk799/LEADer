"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLOBAL_NAV, isNavActive, PRIMARY_NAV, SETTINGS_NAV } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => isNavActive(pathname, href);

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
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
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
          href={GLOBAL_NAV.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive(GLOBAL_NAV.href)
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <GLOBAL_NAV.icon className="h-4 w-4" />
          {GLOBAL_NAV.label}
        </Link>
      </nav>

      <Link
        href={SETTINGS_NAV.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive(SETTINGS_NAV.href) ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <SETTINGS_NAV.icon className="h-4 w-4" />
        {SETTINGS_NAV.label}
      </Link>
    </aside>
  );
}
