import { runAi } from "@/lib/ai";
import { scoreOpportunity } from "@/lib/scoring";
import type { DiscoveryCandidateDto } from "@/lib/discovery";
import type { Workspace } from "@/lib/types";

/**
 * Bring leads found somewhere else (a ChatGPT answer, a document, an email) into
 * Discover as ordinary candidates, so they get scored, deduplicated and reviewed
 * next to everything the searches find.
 */

export interface PastedLead {
  title: string;
  organization?: string;
  url?: string;
  description?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  deadline?: string;
  reason?: string;
}

const MAX_LEADS = 40;
const URL_RE = /https?:\/\/[^\s)\]>"']+/i;

function str(value: unknown, max = 600): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function cleanUrl(value: unknown): string | undefined {
  const raw = str(value, 500);
  if (!raw) return undefined;
  const match = raw.match(URL_RE);
  if (!match) return undefined;
  try {
    return new URL(match[0].replace(/[.,;]+$/, "")).toString();
  } catch {
    return undefined;
  }
}

/** Validate whatever the model returned; anything without a title is dropped. */
export function parseAiLeads(data: unknown): PastedLead[] {
  const list = (data as { leads?: unknown } | null)?.leads;
  if (!Array.isArray(list)) return [];
  const out: PastedLead[] = [];
  for (const item of list) {
    const row = item as Record<string, unknown> | null;
    const title = str(row?.title, 200);
    if (!title) continue;
    const deadline = str(row?.deadline, 40);
    out.push({
      title,
      organization: str(row?.organization, 160),
      url: cleanUrl(row?.url),
      description: str(row?.description, 1200),
      category: str(row?.category, 120),
      budgetMin: num(row?.budgetMin),
      budgetMax: num(row?.budgetMax),
      currency: str(row?.currency, 8),
      deadline: deadline && !Number.isNaN(Date.parse(deadline)) ? deadline : undefined,
      reason: str(row?.reason, 400),
    });
    if (out.length >= MAX_LEADS) break;
  }
  return out;
}

/**
 * No-AI fallback: one lead per block (blank line, bullet or numbered item). The
 * first line is the title, the first link is the URL, the rest is the description.
 */
export function heuristicLeads(text: string): PastedLead[] {
  const normalised = text.replace(/\r/g, "");
  // Numbered items own their sub-bullets; only a list without numbers splits on bullets.
  const topLevel = /^\d+[.)]\s/m.test(normalised) ? /\n(?=\d+[.)]\s)/ : /\n(?=[-*•]\s)/;
  const blocks = normalised
    .split(/\n\s*\n/)
    .flatMap((chunk) => chunk.split(topLevel))
    .map((block) => block.trim())
    .filter(Boolean);
  const out: PastedLead[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.replace(/^\s*(?:#+|\d+[.)]|[-*•])\s*/, "").replace(/\*\*|__/g, "").trim())
      .filter(Boolean);
    const titleLine = lines.find((line) => line.replace(URL_RE, "").trim().length > 3);
    if (!titleLine) continue;
    const url = cleanUrl(block);
    const title = str(titleLine.replace(URL_RE, "").replace(/[:\-–—\s]+$/, ""), 200);
    if (!title) continue;
    const rest = lines.filter((line) => line !== titleLine).join(" ");
    out.push({ title, url, description: str(rest, 1200) });
    if (out.length >= MAX_LEADS) break;
  }
  return out;
}

export async function extractPastedLeads(
  text: string,
  opts: { aiKeys?: unknown; accountId?: string; profile?: string },
): Promise<{ leads: PastedLead[]; usedAi: boolean }> {
  const input = text.slice(0, 30_000);
  try {
    const res = await runAi({
      action: "extractLeads",
      context: input,
      profile: opts.profile,
      aiKeys: opts.aiKeys,
      accountId: opts.accountId,
    });
    if (!res.mocked) {
      const leads = parseAiLeads(res.data);
      if (leads.length) return { leads, usedAi: true };
    }
  } catch {
    // Fall through: a bad model must not stop the user getting their leads in.
  }
  return { leads: heuristicLeads(input), usedAi: false };
}

/** Shape a pasted lead like any other search result so it can be persisted and scored. */
export function pastedLeadToCandidate(
  lead: PastedLead,
  index: number,
  opts: { workspace: Workspace; budgetMaxDkk?: number; label: string },
): DiscoveryCandidateDto {
  const breakdown = scoreOpportunity(
    {
      title: lead.title,
      description: lead.description,
      rawContent: [lead.description, lead.reason].filter(Boolean).join("\n"),
      budgetMin: lead.budgetMin ?? null,
      budgetMax: lead.budgetMax ?? null,
      deadline: lead.deadline ? new Date(lead.deadline) : null,
      organization: lead.organization,
      category: lead.category,
      applicationRoute: "UNKNOWN",
      contacts: [],
    },
    { budgetMaxDkk: opts.budgetMaxDkk ?? 100000 },
  );
  breakdown.computedAt = new Date().toISOString();
  return {
    id: `pasted-${index}`,
    candidateKind: "opportunity",
    title: lead.title,
    description: lead.description,
    rawContent: [lead.description, lead.reason].filter(Boolean).join("\n") || lead.title,
    url: lead.url,
    organization: lead.organization,
    category: lead.category,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    currency: lead.currency,
    deadline: lead.deadline,
    freshness: "unknown",
    applicationRoute: "UNKNOWN",
    contacts: [],
    attachments: [],
    sourceName: opts.label,
    sourceKind: "web-search",
    provider: "pasted",
    query: opts.label,
    matchScore: breakdown.total,
    scoreBreakdown: breakdown,
    reasons: lead.reason ? [lead.reason] : ["Brought in from your own research."],
    signals: ["pasted"],
  };
}
