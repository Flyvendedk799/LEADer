"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut, Moon, Search, Settings, Sun, User as UserIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertsBell } from "@/components/layout/alerts-bell";
import { MobileNav } from "@/components/layout/mobile-nav";
import { openCommandPalette } from "@/components/layout/command-palette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopbarProps {
  user?: { name: string | null; email: string };
}

/** Top bar: page-aware quick search + DK/Global workspace hint + theme + account. */
export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const { theme, setTheme } = useTheme();

  const onGlobal = pathname.startsWith("/global");

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString() ?? "";
    const base = onGlobal ? "/global" : "/opportunities";
    router.push(`${base}?q=${encodeURIComponent(q)}`);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials = (user?.name || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/70 px-4 backdrop-blur">
      <MobileNav />
      <form onSubmit={submitSearch} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder="Search opportunities, organizations, summaries…"
          className="pl-9 pr-14"
        />
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Open command palette"
          title="Command palette (⌘K)"
          className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          <span className="text-xs">⌘</span>K
        </button>
      </form>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1 rounded-md border border-border bg-surface p-0.5 text-xs sm:flex">
          <Link
            href="/"
            className={`rounded px-2.5 py-1 font-medium transition-colors ${!onGlobal ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            🇩🇰 Denmark
          </Link>
          <Link
            href="/global"
            className={`rounded px-2.5 py-1 font-medium transition-colors ${onGlobal ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"}`}
          >
            🌍 Global
          </Link>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>

        <AlertsBell />

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Account menu"
                className="rounded-full bg-primary/15 text-xs font-semibold text-primary hover:bg-primary/25"
              >
                {initials || <UserIcon className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate font-medium">{user.name || "Account"}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
