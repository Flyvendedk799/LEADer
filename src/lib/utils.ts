import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Money ──────────────────────────────────────────────────────────────────

/** Format a budget range compactly, e.g. "50,000–100,000 DKK" or "≤ 75,000 DKK". */
export function formatBudget(
  min?: number | null,
  max?: number | null,
  currency = "DKK",
): string {
  const fmt = (n: number) => new Intl.NumberFormat("da-DK").format(n);
  if (min != null && max != null) {
    return min === max ? `${fmt(max)} ${currency}` : `${fmt(min)}–${fmt(max)} ${currency}`;
  }
  if (max != null) return `≤ ${fmt(max)} ${currency}`;
  if (min != null) return `≥ ${fmt(min)} ${currency}`;
  return "No budget listed";
}

/** A single representative number for pipeline-value sums (prefers max, then min). */
export function budgetValue(min?: number | null, max?: number | null): number {
  return max ?? min ?? 0;
}

// ── Dates / deadlines ────────────────────────────────────────────────────────

export function isExpired(deadline?: Date | string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() < Date.now();
}

/** Whole days until a deadline (negative if past). null when no deadline. */
export function daysUntil(deadline?: Date | string | null): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function formatDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(d));
}

/** "in 3 days" / "2 days ago" / "today". */
export function relativeDeadline(deadline?: Date | string | null): string {
  const d = daysUntil(deadline);
  if (d == null) return "No deadline";
  if (d === 0) return "Due today";
  if (d > 0) return `in ${d} day${d === 1 ? "" : "s"}`;
  return `${Math.abs(d)} day${d === -1 ? "" : "s"} ago`;
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export function truncate(s: string | null | undefined, n = 160): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
