import type { AiAction } from "@/lib/types";

// Centralised prompt templates. Keep outputs strict and JSON where structured.
// {{profile}} is the user's profile blurb; {{context}} is the opportunity text.

export const OWNER_PROFILE_DEFAULT = `Fullstack developer, AI builder, MVP/prototype developer,
product strategy & technical roadmap advisor, automation consultant, startup/SME-focused
technical partner. Strong track record landing funded work, but uses that as one acquisition
lane inside a broader client-acquisition system: direct startups, SME automation, tenders,
community/manual leads and warm-network follow-ups.`;

export const SYSTEM_BASE = `You are LEADer, a client-acquisition CRM assistant for a solo
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
    case "planDiscoverySearch":
      return base(
        `Turn the user's freeform discovery intent into a strict JSON search plan for public-source discovery.
Return exactly: {
  "summary": string,
  "queries": string[] (3-8 concrete search queries, no private/community scraping),
  "requiredTerms": string[] (0-8 terms that candidates should contain),
  "excludedTerms": string[] (0-8 terms to filter out),
  "positiveKeywords": string[] (3-10 lane-fit keywords),
  "evidenceRequirements": string[] (2-6 evidence checks),
  "suggestedLaneSlug": string | null,
  "confidence": number (0-100),
  "notes": string[] (0-5 short caveats or strategy notes)
}.
Respect compliance: public automated sources only; community/network intent must be manual or user-assisted.`,
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
    case "nextBestAction":
      return base("Recommend the single best next action for this opportunity in one short sentence (e.g. 'Email the contact to confirm scope before the deadline').");
    case "qualifyLead":
      return base(
        `Qualify this lead as JSON with keys: fit (0-100), confidence (0-100), buyerIntent (LOW|MEDIUM|HIGH),
recommendedStatus (DISCOVERED|QUALIFYING|INTERESTING|CONTACTED|PROPOSAL|NEGOTIATION|WON|LOST|ARCHIVED),
risks (string[]), reasons (string[]), nextAction (string). Be strict about evidence.`,
        true,
      );
    case "draftOutreach":
      return base("Write a concise, human outreach email (subject + body) that references the specific account/lead evidence and proposes one low-friction next step.");
    case "draftProposal":
      return base("Write a short proposal outline with scope, approach, timeline, proof points, assumptions, and a clear next step. Keep it practical and buyer-facing.");
    case "draftFollowUp":
      return base("Write a warm follow-up message that references the previous context, adds one useful angle, and asks for a simple next step. Keep it under 130 words.");
    case "summarizeAccount":
      return base("Summarize this account for sales context: what they do, likely pain, open deals, relationship context, and best next move. Use bullets.");
    case "similar":
      return base("Identify the 2–4 most similar opportunities and explain the common thread in one sentence.");
    default:
      return base("Summarize this opportunity.");
  }
}
