"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Top bar: page-aware quick search + DK/Global workspace hint + theme toggle. */
export function Topbar() {
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

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/70 px-4 backdrop-blur">
      <form onSubmit={submitSearch} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder="Search opportunities, organizations, summaries…"
          className="pl-9"
        />
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
      </div>
    </header>
  );
}
