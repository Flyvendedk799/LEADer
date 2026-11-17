import { extractBudget, extractExplicitDeadline } from "@/lib/ingestion/extract";

export type FieldCitation = { field: string; value: string | null; status: "source" | "snippet" | "unverified" | "unknown"; quote?: string; url?: string; retrievedAt: string };
type Input = {
  title: string; organization?: string | null; description?: string | null; rawContent?: string | null;
  url?: string | null; deadline?: string | Date | null; budgetMin?: number | null; budgetMax?: number | null;
  currency?: string | null; applicationRoute?: string | null;
  contacts?: { name?: string; email?: string; role?: string }[];
  provenance?: { status: string; retrievedAt: string; url?: string };
};
/** A citation is only attached when the supplied source text supports the actual value. */
export function citeCandidateFields(candidate: Input): FieldCitation[] {
  const text = (candidate.rawContent || candidate.description || "").replace(/\s+/g, " ").trim();
  const retrievedAt = candidate.provenance?.retrievedAt ?? new Date().toISOString();
  const url = candidate.provenance?.url || candidate.url || undefined;
  const citation = (field: string, value: string | null, pattern?: RegExp): FieldCitation => {
    const index = value ? pattern ? text.search(pattern) : text.toLowerCase().indexOf(value.toLowerCase()) : -1;
    const quote = index >= 0 ? text.slice(Math.max(0, index - 70), index + Math.max(value?.length ?? 0, 100) + 70).slice(0, 500) : undefined;
    return { field, value, status: !value ? "unknown" : !quote ? "unverified" : candidate.provenance?.status === "read" ? "source" : "snippet", quote, url, retrievedAt };
  };
  const budget = extractBudget(text);
  const budgetValue = [candidate.budgetMin, candidate.budgetMax].filter(v => v != null).join(" – ");
  const budgetMatches = (candidate.budgetMin == null || candidate.budgetMin === budget.min) && (candidate.budgetMax == null || candidate.budgetMax === budget.max);
  const deadline = candidate.deadline ? new Date(candidate.deadline).toISOString() : null;
  const extractedDeadline = extractExplicitDeadline(text)?.toISOString();
  const fields = [
    citation("Title", candidate.title), citation("Buyer", candidate.organization || null),
    citation("Scope", candidate.description || null),
    citation("Budget / rate", budgetValue ? `${budgetValue} ${candidate.currency || ""}`.trim() : null, budgetMatches ? /\d[\d., ]*\s*(?:kr|dkk|eur|usd|€|\$)|(?:budget|tilskud|pris|værdi)/i : /$^/),
    citation("Deadline", deadline, deadline === extractedDeadline ? /ansøgningsfrist|tilbudsfrist|deadline|closing date|apply by|frist/i : /$^/),
    citation("Submission route", candidate.applicationRoute && candidate.applicationRoute !== "UNKNOWN" ? candidate.applicationRoute : null, /ansøg|application|apply|formular|kontakt|contact|email|e-mail/i),
    citation("Contact", candidate.contacts?.map(c => c.email).filter(Boolean).join(", ") || null),
  ];
  return fields;
}
