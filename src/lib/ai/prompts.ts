import type { AiAction } from "@/lib/types";

// Centralised prompt templates. Keep outputs strict and JSON where structured.
// {{profile}} is the user's profile blurb; {{context}} is the opportunity text.

export const OWNER_PROFILE_DEFAULT = `Fullstack developer, AI builder, MVP/prototype developer,
product strategy & technical roadmap advisor, automation consultant, startup/SME-focused
technical partner. Prefers funded/voucher/accelerator/innovation assignments under 100,000 DKK
that are active, have a clear deadline, and a direct application or contact route.`;

export const SYSTEM_BASE = `You are LEADer, an opportunity-intelligence assistant for a solo
technical consultant. Be concise, concrete, and honest. Never invent budgets, deadlines, or
contact details that are not present in the source text. Output must match the requested format.`;

interface PromptCtx {
  profile?: string;
  context?: string;
  extra?: string;
}

export function buildPrompt(action: AiAction, ctx: PromptCtx): { system: string; user: string; json: boolean } {
  const profile = ctx.profile || OWNER_PROFILE_DEFAULT;
  const context = ctx.context || "";
  const base = (instruction: string, json = false) => ({
    system: SYSTEM_BASE,
    user: `User profile:\n${profile}\n\nOpportunity context:\n${context}\n\n${ctx.extra || ""}\n\nTask:\n${instruction}`,
    json,
  });

  switch (action) {
    case "summarize":
      return base("Write a 2–4 sentence summary of this opportunity: what it is, who it's for, and the ask.");
    case "extract":
      return base(
        `Extract structured fields as JSON with keys: title, description, budgetMin, budgetMax,
currency, deadline (ISO date or null), organization, location, country, category,
applicationRoute (DIRECT|APPLICATION|UNKNOWN), contact {name,email,phone,role}, requirements (string[]).
Use null when not present. Do not guess.`,
        true,
      );
    case "classify":
      return base(
        `Classify this opportunity. Return JSON: { category: string, tags: string[] (3-6),
fitForSoloTechnicalSupplier: boolean }.`,
        true,
      );
    case "explainScore":
      return base("In 2–3 sentences, explain why this opportunity is (or isn't) a strong match for the user's profile. Be specific about budget, deadline, and skill fit.");
    case "draftApplication":
      return base("Write a short, professional application/proposal (120–200 words) the user could send to apply for this opportunity. Reference their profile strengths and the opportunity's needs.");
    case "draftPitch":
      return base("Write a tight 80–120 word supplier pitch positioning the user as the right partner for this opportunity.");
    case "draftEmail":
      return base("Write a concise, friendly outreach email (subject + body) to the contact person about this opportunity. Keep it under 150 words.");
    case "checklist":
      return base("Produce a practical markdown checklist of everything needed to apply for or pursue this opportunity (documents, deadlines, info to gather, next steps).");
    case "compare":
      return base("Compare these opportunities for the user. Return a short markdown table plus a one-line recommendation of which to pursue first and why.");
    case "nextAction":
      return base("Recommend the single best next action for this opportunity in one short sentence (e.g. 'Email the contact to confirm scope before the deadline').");
    case "similar":
      return base("Identify the 2–4 most similar opportunities and explain the common thread in one sentence.");
    case "searchQueries":
      return base(
        `Create a focused web-discovery search plan for finding real supplier opportunities.
Return strict JSON with keys:
{
  "queries": string[] (4-7 concrete search queries),
  "focusTerms": string[] (5-10 terms to prioritize),
  "avoidTerms": string[] (3-8 terms likely to produce non-leads/info pages),
  "rationale": string (one concise sentence)
}
Prefer Danish terminology for Danish searches. Include source-specific searches when useful.
Queries should find concrete assignments, tenders, procurement pages, funded startup/SME software tasks,
and reusable source/list pages only when the context asks for sources. Do not include stale/expired intent.`,
        true,
      );
    default:
      return base("Summarize this opportunity.");
  }
}
