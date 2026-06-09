import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { aiRequestSchema } from "@/lib/validators";
import { runAi } from "@/lib/ai";
import { formatBudget, formatDate } from "@/lib/utils";
import type { AiAction, DraftKind } from "@/lib/types";
import type { Prisma } from "@prisma/client";

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

type OppForContext = Prisma.OpportunityGetPayload<{ include: { contacts: true } }>;

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
    const { action, opportunityId, opportunityIds, payload, save } = parsed.data;

    const profile = profileString(user);
    let context: string | undefined;
    let extra: string | undefined;
    let opportunity: OppForContext | null = null;

    if (action === "extract") {
      context = (payload?.text as string) ?? (payload?.content as string) ?? "";
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

    const result = await runAi({ action, context, profile, extra });

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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
