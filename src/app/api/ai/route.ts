import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { aiRequestSchema } from "@/lib/validators";
import { runAi } from "@/lib/ai";
import { formatBudget, formatDate } from "@/lib/utils";
import type { AiAction, ConversionAssetKind, DraftKind } from "@/lib/types";
import type { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";

// action → DraftKind mapping for persisting AI text output.
const DRAFT_KIND: Partial<Record<AiAction, DraftKind>> = {
  summarize: "SUMMARY",
  explainScore: "EXPLANATION",
  draftApplication: "APPLICATION",
  draftPitch: "PITCH",
  draftEmail: "EMAIL",
  checklist: "CHECKLIST",
  compare: "COMPARISON",
  nextAction: "EXPLANATION",
};

const ASSET_KIND: Partial<Record<AiAction, ConversionAssetKind>> = {
  summarize: "SUMMARY",
  summarizeAccount: "SUMMARY",
  explainScore: "SUMMARY",
  qualifyLead: "SUMMARY",
  draftApplication: "PROPOSAL",
  draftProposal: "PROPOSAL",
  draftPitch: "PITCH",
  draftEmail: "OUTREACH",
  draftOutreach: "OUTREACH",
  draftFollowUp: "FOLLOW_UP",
  checklist: "CHECKLIST",
  nextAction: "SUMMARY",
  nextBestAction: "SUMMARY",
};

type OppForContext = Prisma.OpportunityGetPayload<{ include: { contacts: true } }>;
type DealForContext = Prisma.DealGetPayload<{
  include: {
    account: true;
    people: { include: { person: true } };
    evidence: true;
    tasks: true;
  };
}>;
type AccountForContext = Prisma.AccountGetPayload<{
  include: {
    people: true;
    deals: true;
    evidence: true;
    touchpoints: true;
  };
}>;
type CandidateForContext = Prisma.DiscoveryCandidateGetPayload<{
  include: { lane: true; evidence: true; account: true; deal: true };
}>;

function profileString(user: {
  headline?: string | null;
  bio?: string | null;
  preferredProjectTypes?: string[];
}): string | undefined {
  const parts: string[] = [];
  if (user.headline) parts.push(user.headline);
  if (user.bio) parts.push(user.bio);
  if (user.preferredProjectTypes?.length)
    parts.push(`Preferred project types: ${user.preferredProjectTypes.join(", ")}.`);
  return parts.length ? parts.join("\n") : undefined;
}

function opportunityContext(o: OppForContext): string {
  const lines: string[] = [];
  lines.push(`Title: ${o.title}`);
  if (o.organization) lines.push(`Organization: ${o.organization}`);
  if (o.budgetMin != null || o.budgetMax != null)
    lines.push(`Budget: ${formatBudget(o.budgetMin, o.budgetMax, o.currency ?? "DKK")}`);
  if (o.deadline) lines.push(`Deadline: ${formatDate(o.deadline)}`);
  if (o.description) lines.push(`Description: ${o.description}`);
  if (o.rawContent) lines.push(`Source content: ${o.rawContent}`);
  return lines.join("\n");
}

function dealContext(d: DealForContext): string {
  const lines: string[] = [`Deal: ${d.title}`];
  if (d.account) lines.push(`Account: ${d.account.name} (${d.account.type})`);
  if (d.valueMin != null || d.valueMax != null) lines.push(`Value: ${formatBudget(d.valueMin, d.valueMax, d.currency ?? "DKK")}`);
  if (d.deadline) lines.push(`Deadline: ${formatDate(d.deadline)}`);
  lines.push(`Status: ${d.status}`);
  if (d.category) lines.push(`Category: ${d.category}`);
  if (d.summary) lines.push(`Summary: ${d.summary}`);
  if (d.nextAction) lines.push(`Current next action: ${d.nextAction}`);
  if (d.people.length) lines.push(`People: ${d.people.map((p) => [p.person.name, p.person.role, p.person.email].filter(Boolean).join(" / ")).join("; ")}`);
  if (d.evidence.length) lines.push(`Evidence:\n${d.evidence.map((e) => `- ${e.title || e.sourceName || e.kind}: ${e.snippet}`).join("\n")}`);
  if (d.tasks.length) lines.push(`Open tasks:\n${d.tasks.map((t) => `- ${t.title}${t.dueAt ? ` (${formatDate(t.dueAt)})` : ""}`).join("\n")}`);
  return lines.join("\n");
}

function accountContext(a: AccountForContext): string {
  const lines: string[] = [`Account: ${a.name} (${a.type})`];
  if (a.description) lines.push(`Description: ${a.description}`);
  if (a.website) lines.push(`Website: ${a.website}`);
  if (a.people.length) lines.push(`People: ${a.people.map((p) => [p.name, p.role, p.email].filter(Boolean).join(" / ")).join("; ")}`);
  if (a.deals.length) lines.push(`Deals:\n${a.deals.map((d) => `- ${d.title} (${d.status}, score ${d.pursuitScore ?? "n/a"})`).join("\n")}`);
  if (a.evidence.length) lines.push(`Evidence:\n${a.evidence.map((e) => `- ${e.title || e.kind}: ${e.snippet}`).join("\n")}`);
  if (a.touchpoints.length) lines.push(`Recent touchpoints:\n${a.touchpoints.map((t) => `- ${t.summary}`).join("\n")}`);
  return lines.join("\n");
}

function candidateContext(c: CandidateForContext): string {
  const lines = [`Candidate: ${c.title}`];
  if (c.lane) lines.push(`Lane: ${c.lane.name}`);
  if (c.organization) lines.push(`Organization: ${c.organization}`);
  if (c.budgetMin != null || c.budgetMax != null) lines.push(`Budget: ${formatBudget(c.budgetMin, c.budgetMax, c.currency ?? "DKK")}`);
  if (c.deadline) lines.push(`Deadline: ${formatDate(c.deadline)}`);
  if (c.description) lines.push(`Description: ${c.description}`);
  if (c.rawContent) lines.push(`Source content: ${c.rawContent}`);
  if (c.evidence.length) lines.push(`Evidence:\n${c.evidence.map((e) => `- ${e.title || e.kind}: ${e.snippet}`).join("\n")}`);
  return lines.join("\n");
}

// POST /api/ai — single gateway for every AI action (owner-scoped).
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = aiRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { action, opportunityId, opportunityIds, dealId, accountId, candidateId, payload, save } = parsed.data;

    const profile = profileString(user);
    let context: string | undefined;
    let extra: string | undefined;
    let opportunity: OppForContext | null = null;
    let deal: DealForContext | null = null;
    let account: AccountForContext | null = null;
    let candidate: CandidateForContext | null = null;

    if (action === "extract") {
      context = (payload?.text as string) ?? (payload?.content as string) ?? "";
    } else if (dealId) {
      deal = await db.deal.findFirst({
        where: { id: dealId, ownerId: user.id },
        include: { account: true, people: { include: { person: true } }, evidence: true, tasks: true },
      });
      if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      context = dealContext(deal);
    } else if (accountId) {
      account = await db.account.findFirst({
        where: { id: accountId, ownerId: user.id },
        include: { people: true, deals: true, evidence: true, touchpoints: { orderBy: { occurredAt: "desc" }, take: 5 } },
      });
      if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      context = accountContext(account);
    } else if (candidateId) {
      candidate = await db.discoveryCandidate.findFirst({
        where: { id: candidateId, ownerId: user.id },
        include: { lane: true, evidence: true, account: true, deal: true },
      });
      if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      context = candidateContext(candidate);
    } else if (action === "compare") {
      const ids = opportunityIds ?? [];
      const opps = await db.opportunity.findMany({
        where: { id: { in: ids }, ownerId: user.id },
        include: { contacts: true },
      });
      context = opps
        .map((o, i) => `--- Opportunity ${i + 1} ---\n${opportunityContext(o)}`)
        .join("\n\n");
    } else if (action === "similar") {
      if (opportunityId) {
        opportunity = await db.opportunity.findFirst({
          where: { id: opportunityId, ownerId: user.id },
          include: { contacts: true },
        });
        if (opportunity) {
          context = opportunityContext(opportunity);
          const peers = await db.opportunity.findMany({
            where: {
              ownerId: user.id,
              id: { not: opportunity.id },
              ...(opportunity.category ? { category: opportunity.category } : {}),
            },
            include: { contacts: true },
            take: 8,
            orderBy: { matchScore: "desc" },
          });
          extra = `Candidate set:\n${peers
            .map((o, i) => `${i + 1}. ${opportunityContext(o)}`)
            .join("\n\n")}`;
        }
      }
    } else if (opportunityId) {
      opportunity = await db.opportunity.findFirst({
        where: { id: opportunityId, ownerId: user.id },
        include: { contacts: true },
      });
      if (!opportunity) {
        return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
      }
      context = opportunityContext(opportunity);
    }

    const result = await runAi({ action, context, profile, extra, aiKeys: user.aiKeys });

    if (save && result.text && (deal || account || candidate)) {
      const kind = ASSET_KIND[action] ?? "SUMMARY";
      const asset = await db.conversionAsset.create({
        data: {
          ownerId: user.id,
          dealId: deal?.id ?? candidate?.dealId ?? undefined,
          accountId: account?.id ?? deal?.accountId ?? candidate?.accountId ?? undefined,
          candidateId: candidate?.id,
          kind,
          content: result.text,
          model: result.model,
          title: `${action} · ${new Date().toLocaleDateString("da-DK")}`,
        },
      });
      if ((action === "nextBestAction" || action === "nextAction") && deal) {
        await db.deal.update({ where: { id: deal.id }, data: { nextAction: result.text } });
      }
      return NextResponse.json({ ...result, assetId: asset.id });
    }

    // Persist a Draft + convenience fields when there's text and save is set.
    if (save && result.text && opportunityId && opportunity) {
      const kind = DRAFT_KIND[action];
      if (kind) {
        await db.draft.create({
          data: {
            opportunityId,
            authorId: user.id,
            kind,
            content: result.text,
            model: result.model,
          },
        });
        await db.activity.create({
          data: {
            opportunityId,
            type: "AI_DRAFT",
            message: `AI ${action} draft saved`,
            metadata: { action, kind, model: result.model },
          },
        });
      }

      const convenience: Prisma.OpportunityUpdateInput = {};
      if (action === "summarize") convenience.aiSummary = result.text;
      else if (action === "explainScore") convenience.whyRelevant = result.text;
      else if (action === "nextAction") convenience.nextAction = result.text;
      if (Object.keys(convenience).length) {
        await db.opportunity.update({ where: { id: opportunityId }, data: convenience });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
