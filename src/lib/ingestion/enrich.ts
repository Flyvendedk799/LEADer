import { runAi } from "@/lib/ai";
import { hasLlm } from "@/lib/ai/provider";

export interface OpportunityEnrichment {
  aiSummary: string;
  whyRelevant: string;
  nextAction: string;
}

const ENRICH_EXTRA = `After the summary, add exactly two lines:
Why: <one sentence on why this fits a solo technical supplier>
Next: <one concrete next step>`;

/** Split a summarize response into the three CRM fields. Returns null when the text is empty. */
export function parseEnrichment(text: string): OpportunityEnrichment | null {
  const why = text.match(/^Why:\s*(.+)$/m);
  const next = text.match(/^Next:\s*(.+)$/m);
  const summary = text
    .replace(/^Why:\s*.+$/m, "")
    .replace(/^Next:\s*.+$/m, "")
    .trim();
  if (!summary) return null;
  return {
    aiSummary: summary,
    whyRelevant: why?.[1]?.trim() || summary,
    nextAction: next?.[1]?.trim() || "Review the summary and decide whether to pursue.",
  };
}

/**
 * One real-model call per new opportunity. Mock output is discarded so offline
 * fallback text never lands in the CRM.
 */
export async function enrichOpportunityText(input: {
  title: string;
  description?: string | null;
  rawContent?: string | null;
  aiKeys?: unknown;
  accountId?: string;
}): Promise<OpportunityEnrichment | null> {
  if (!hasLlm(input.aiKeys)) return null;
  const context = [input.title, input.description, input.rawContent].filter(Boolean).join("\n\n").slice(0, 8000);
  const result = await runAi({
    action: "summarize",
    context,
    extra: ENRICH_EXTRA,
    aiKeys: input.aiKeys,
    accountId: input.accountId,
  });
  if (result.mocked || !result.text) return null;
  return parseEnrichment(result.text);
}
