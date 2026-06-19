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
    case "summarize":
      return { ...base, text: `${snippet(context, 200) || "An opportunity"} — likely a small, fundable technical assignment suited to a solo fullstack/AI supplier.${note}` };
    case "explainScore":
      return { ...base, text: `Strong fit: small budget, active deadline, and AI/fullstack/MVP relevance align with your profile.${note}` };
    case "draftApplication":
      return { ...base, text: `Hi,\n\nI'd love to support this project. As a fullstack developer and AI/MVP builder I deliver fast, fundable prototypes and clear technical roadmaps. I can scope the work to fit the budget and deadline, and start with a short discovery to de-risk delivery.\n\nBest,\n[Your name]${note}` };
    case "draftPitch":
      return { ...base, text: `Solo technical partner for startups & SMEs: I turn funded ideas into shipped MVPs — fullstack build, AI features, and a pragmatic product roadmap, sized to your voucher/grant budget.${note}` };
    case "draftEmail":
      return { ...base, text: `Subject: Quick question about your project\n\nHi [name],\n\nI saw your opportunity and it lines up well with what I do (fullstack + AI/MVP for startups). Could we have a 15-min call before the deadline to confirm scope?\n\nThanks,\n[Your name]${note}` };
    case "checklist":
      return { ...base, text: `### Apply checklist (mock)\n- [ ] Confirm budget & deadline from the source\n- [ ] Identify & verify the contact person\n- [ ] Prepare a 1-page proposal\n- [ ] Tailor portfolio links\n- [ ] Submit / send before the deadline${note}` };
    case "nextAction":
      return { ...base, text: `Email the contact to confirm scope before the deadline.${note}` };
    default:
      return { ...base, text: `No-op${note}` };
  }
}
