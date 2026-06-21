import type { OpportunityStatus, SourceType } from "@/lib/types";

// Centralised display metadata for statuses, scores and source types.

export const STATUS_META: Record<
  OpportunityStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "muted"; dot: string }
> = {
  NEW: { label: "New", variant: "default", dot: "bg-primary" },
  INTERESTING: { label: "Interesting", variant: "default", dot: "bg-accent" },
  WATCH: { label: "Watch", variant: "warning", dot: "bg-warning" },
  CONTACTED: { label: "Contacted", variant: "secondary", dot: "bg-sky-400" },
  APPLIED: { label: "Applied", variant: "secondary", dot: "bg-violet-400" },
  WON: { label: "Won", variant: "success", dot: "bg-success" },
  LOST: { label: "Lost", variant: "destructive", dot: "bg-destructive" },
  ARCHIVED: { label: "Archived", variant: "muted", dot: "bg-muted-foreground" },
};

/** Score band → color + label for the score badge. */
export function scoreBand(score?: number | null): {
  label: string;
  className: string;
} {
  if (score == null) return { label: "—", className: "bg-muted text-muted-foreground" };
  if (score >= 80) return { label: "Excellent", className: "bg-success/15 text-success" };
  if (score >= 60) return { label: "Strong", className: "bg-primary/15 text-primary" };
  if (score >= 40) return { label: "Moderate", className: "bg-warning/15 text-warning" };
  return { label: "Low", className: "bg-muted text-muted-foreground" };
}

export const SOURCE_TYPE_META: Record<SourceType, { label: string; automatable: boolean }> = {
  PUBLIC_WEB: { label: "Public website", automatable: true },
  RSS: { label: "RSS feed", automatable: true },
  PROCUREMENT: { label: "Procurement portal", automatable: true },
  ACCELERATOR: { label: "Accelerator page", automatable: true },
  NEWSLETTER: { label: "Newsletter", automatable: true },
  API: { label: "API", automatable: true },
  FACEBOOK_MANUAL: { label: "Facebook / community", automatable: false },
  UPLOAD: { label: "Uploaded export", automatable: false },
  MANUAL: { label: "Manual entry", automatable: false },
};

export const APP_NAV = [
  { href: "/", label: "Cockpit", icon: "LayoutDashboard" },
  { href: "/deals", label: "Deals", icon: "BriefcaseBusiness" },
  { href: "/accounts", label: "Accounts", icon: "Building2" },
  { href: "/sources", label: "Sources", icon: "Radar" },
  { href: "/import", label: "Community import", icon: "ClipboardPaste" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;
