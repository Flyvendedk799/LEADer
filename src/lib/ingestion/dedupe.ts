import { createHash } from "node:crypto";

/** Candidate opportunity produced by any ingestion lane before persistence. */
export interface OpportunityCandidate {
  title: string;
  description?: string;
  rawContent?: string;
  url?: string;
  organization?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  deadline?: Date | null;
  postedAt?: Date | null;
  location?: string;
  country?: string;
  region?: string;
  category?: string;
  applicationRoute?: "DIRECT" | "APPLICATION" | "UNKNOWN";
  contacts?: { name?: string; email?: string; role?: string }[];
  attachments?: { label?: string; url: string; kind?: string }[];
}

function normUrl(url?: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.hash = "";
    // Drop common tracking params for stable dedupe.
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach(
      (p) => u.searchParams.delete(p),
    );
    return `${u.origin}${u.pathname}${u.search}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return url.toLowerCase().trim();
  }
}

function normText(s?: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Stable hash from URL (if any) else title+org — used as Opportunity.dedupeHash. */
export function dedupeHash(c: OpportunityCandidate): string {
  const url = normUrl(c.url);
  const key = url || `${normText(c.title)}::${normText(c.organization)}`;
  return createHash("sha1").update(key).digest("hex");
}
