import type { AiAction, AiExtractResult, AiResult } from "@/lib/types";
import { aiConfig, chat, hasLlm } from "./provider";
import { buildPrompt } from "./prompts";

// ─────────────────────────────────────────────────────────────────────────
// AI gateway. One entry point for every AI feature. When LLM_API_KEY is unset,
// returns deterministic MOCK output so the whole app runs offline.
//
// To go live: set LLM_API_KEY (+ optional LLM_BASE_URL / LLM_MODEL) in .env.
// ─────────────────────────────────────────────────────────────────────────

export interface RunAiArgs {
  action: AiAction;
  context?: string; // opportunity text / pasted content
  profile?: string;
  extra?: string; // extra instruction context (e.g. comparison set)
  aiKeys?: unknown;
}

export async function runAi(args: RunAiArgs): Promise<AiResult> {
  const { action, context, profile, extra, aiKeys } = args;
  const cfg = aiConfig(aiKeys);

  if (!hasLlm(aiKeys)) {
    return mockResult(action, context);
  }

  const { system, user, json } = buildPrompt(action, { profile, context, extra });
  const raw = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { json },
    cfg,
  );

  if (json) {
    let data: unknown = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = { _parseError: true, raw };
    }
    return { action, model: cfg.model, mocked: false, data };
  }
  return { action, model: cfg.model, mocked: false, text: raw.trim() };
}

/** Typed helper for the extract action. */
export async function aiExtract(
  context: string,
  profile?: string,
  aiKeys?: unknown,
): Promise<AiExtractResult> {
  const res = await runAi({ action: "extract", context, profile, aiKeys });
  return (res.data as AiExtractResult) || {};
}

// ── Deterministic mock (offline mode) ────────────────────────────────────────

const MOCK_MODEL = "mock-llm";

function snippet(s = "", n = 220): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

function termsFromText(text: string, limit = 8): string[] {
  const stop = new Set([
    "about", "after", "against", "with", "from", "into", "that", "this", "have",
    "will", "find", "lead", "leads", "client", "clients", "search", "freeform",
    "brief", "lane", "denmark", "danish", "public", "source", "sources", "need",
    "needs", "want", "wants", "looking", "for", "and", "the", "you", "your",
  ]);
  const words = text
    .toLowerCase()
    .match(/[a-zæøå0-9][a-zæøå0-9-]{2,}/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (stop.has(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}

function mockDiscoveryPlan(context: string) {
  const briefMatch = context.match(/Freeform brief:\s*([\s\S]*?)(?:\n\n|$)/i);
  const brief = snippet(briefMatch?.[1] || context, 180) || "small technical client-acquisition leads";
  const terms = termsFromText(brief, 6);
  const core = terms.length ? terms.join(" ") : "software AI automation MVP";
  return {
    summary: `Search for ${brief}`,
    queries: [
      `${core} Denmark company needs software consultant`,
      `${core} startup MVP prototype founder Denmark`,
      `${core} SME AI automation workflow dashboard`,
      `${core} grant voucher funded technical supplier`,
    ],
    requiredTerms: terms.slice(0, 3),
    excludedTerms: ["course", "webinar", "internship", "equity only"],
    positiveKeywords: [...new Set([...terms, "software", "AI", "automation", "MVP"])].slice(0, 10),
    evidenceRequirements: ["clear buyer or company", "explicit technical need", "reachable source", "reason to act now"],
    suggestedLaneSlug: undefined,
    confidence: 62,
    notes: [
      "Mock AI plan: add an AI API key in Settings for deeper query interpretation.",
      "Automated discovery is limited to public sources.",
    ],
  };
}

function mockResult(action: AiAction, context = ""): AiResult {
  const note = " (mock output — add an AI API key in Settings for real results)";
  const base = { action, model: MOCK_MODEL, mocked: true } as const;

  switch (action) {
    case "extract": {
      const data: AiExtractResult = {
        title: snippet(context.split("\n")[0] || "Untitled opportunity", 80),
        description: snippet(context, 300),
        budgetMin: undefined,
        budgetMax: undefined,
        currency: "DKK",
        deadline: undefined,
        organization: undefined,
        applicationRoute: "UNKNOWN",
        requirements: ["Review source for budget and deadline", "Confirm contact person"],
      };
      return { ...base, data };
    }
    case "classify":
      return {
        ...base,
        data: {
          category: "Software / MVP development",
          tags: ["startup", "fullstack", "mvp", "ai"],
          fitForSoloTechnicalSupplier: true,
        },
      };
    case "planDiscoverySearch":
      return { ...base, data: mockDiscoveryPlan(context) };
    case "compare":
      return { ...base, text: `**Comparison (mock)**\n\n| Field | A | B |\n|---|---|---|\n| Fit | high | medium |\n\nPursue the higher-scoring, sooner-deadline one first.${note}` };
    case "similar":
      return { ...base, text: `These share a startup/MVP + funded-supplier pattern.${note}` };
    case "searchQueries":
      return {
        ...base,
        data: {
          queries: [
            "software udbud Danmark teknisk sparring MVP prototype tilbudsfrist",
            "site:ehsys.dk/indkoeb/alle OR site:beyondbeta.ehsys.dk/indkoeb/tilbud/indsend software produkt roadmap",
            "SMV Digital softwareudvikling integration webapp leverandør voucher Danmark",
            "AI automatisering proof of concept fullstack udvikler tilskud Danmark",
          ],
          focusTerms: ["software", "udbud", "tilbudsfrist", "MVP", "teknisk sparring", "produktroadmap"],
          avoidTerms: ["guide", "kursus", "nyhed", "artikel"],
          rationale: `Mock search plan for Danish funded software opportunities.${note}`,
        },
      };
    case "qualifyLead":
      return {
        ...base,
        data: {
          fit: 72,
          confidence: 64,
          buyerIntent: "MEDIUM",
          recommendedStatus: "QUALIFYING",
          risks: ["Confirm budget and decision maker"],
          reasons: ["Clear technical need", "Likely reachable buyer"],
          nextAction: "Send a short scope-confirmation email.",
        },
      };
    case "summarize":
      return { ...base, text: `${snippet(context, 200) || "An opportunity"} — likely a small, fundable technical assignment suited to a solo fullstack/AI supplier.${note}` };
    case "summarizeAccount":
      return { ...base, text: `- Likely buyer context: ${snippet(context, 120) || "needs qualification"}\n- Best angle: connect the technical pain to a small scoped sprint.\n- Next move: ask for a 15-minute fit call.${note}` };
    case "explainScore":
      return { ...base, text: `Strong fit: small budget, active deadline, and AI/fullstack/MVP relevance align with your profile.${note}` };
    case "draftApplication":
      return { ...base, text: `Hi,\n\nI'd love to support this project. As a fullstack developer and AI/MVP builder I deliver fast, fundable prototypes and clear technical roadmaps. I can scope the work to fit the budget and deadline, and start with a short discovery to de-risk delivery.\n\nBest,\n[Your name]${note}` };
    case "draftProposal":
      return { ...base, text: `## Proposal outline\n\n**Goal:** Validate the core product workflow and ship a usable first version.\n\n**Approach:** Start with a short scope call, define the riskiest workflow, then build a focused fullstack/AI prototype with weekly demos.\n\n**Next step:** Confirm budget, deadline, and decision maker.${note}` };
    case "draftPitch":
      return { ...base, text: `Solo technical partner for startups & SMEs: I turn funded ideas into shipped MVPs — fullstack build, AI features, and a pragmatic product roadmap, sized to your voucher/grant budget.${note}` };
    case "draftEmail":
    case "draftOutreach":
      return { ...base, text: `Subject: Quick question about your project\n\nHi [name],\n\nI saw your opportunity and it lines up well with what I do (fullstack + AI/MVP for startups). Could we have a 15-min call before the deadline to confirm scope?\n\nThanks,\n[Your name]${note}` };
    case "draftFollowUp":
      return { ...base, text: `Subject: Quick follow-up\n\nHi [name],\n\nJust following up on this. The part that stood out to me is that the first version can likely be scoped into a small, useful sprint before any larger build. Happy to sanity-check the scope in 15 minutes.\n\nBest,\n[Your name]${note}` };
    case "checklist":
      return { ...base, text: `### Apply checklist (mock)\n- [ ] Confirm budget & deadline from the source\n- [ ] Identify & verify the contact person\n- [ ] Prepare a 1-page proposal\n- [ ] Tailor portfolio links\n- [ ] Submit / send before the deadline${note}` };
    case "nextAction":
    case "nextBestAction":
      return { ...base, text: `Email the contact to confirm scope before the deadline.${note}` };
    default:
      return { ...base, text: `No-op${note}` };
  }
}
