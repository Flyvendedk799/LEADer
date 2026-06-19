import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnerId, requireUser } from "@/lib/auth";
import { communityImportSchema } from "@/lib/validators";
import { dedupeHash } from "@/lib/ingestion/dedupe";
import { aiExtract } from "@/lib/ai";
import { scoreOpportunity } from "@/lib/scoring";
import type { AiExtractResult, ScoreWeights, Workspace } from "@/lib/types";
import { apiError } from "@/lib/api";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Compliant community / Facebook import lane.
//
// GET    → recent CommunityImport rows for the owner.
// POST   → create a CommunityImport (PENDING). Optionally aiExtract() the
//          pasted content into candidate fields and stash them (EXTRACTED).
// PATCH  → confirm: turn an extracted import into a scored Opportunity.
//
// The server never touches Facebook — `content` is supplied by the user
// (manual paste / user-assisted capture). See docs/COMPLIANCE.md.
// ─────────────────────────────────────────────────────────────────────────

const confirmSchema = z.object({ id: z.string().min(1) });

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const imports = await db.communityImport.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(imports);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const ownerId = user.id;
    const json = await req.json();
    const parsed = communityImportSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const row = await db.communityImport.create({
      data: {
        ownerId,
        groupName: data.groupName,
        author: data.author,
        postDate: data.postDate,
        url: data.url || null,
        content: data.content,
        notes: data.notes,
        status: "PENDING",
      },
    });

    let extracted: AiExtractResult | null = null;
    // The CommunityImport model has no workspace column, so the chosen
    // workspace rides along in the extracted JSON for the confirm step.
    const stash = (e: AiExtractResult | null) => ({ ...(e ?? {}), __workspace: data.workspace });

    if (data.autoExtract !== false) {
      extracted = await aiExtract(data.content, undefined, user.aiKeys);
    }
    await db.communityImport.update({
      where: { id: row.id },
      data: {
        extracted: stash(extracted) as object,
        status: extracted ? "EXTRACTED" : "PENDING",
      },
    });

    const updated = await db.communityImport.findUnique({ where: { id: row.id } });
    return NextResponse.json({ import: updated ?? row, extracted });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json();
    const parsed = confirmSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const imp = await db.communityImport.findFirst({
      where: { id: parsed.data.id, ownerId },
    });
    if (!imp) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }
    if (imp.opportunityId) {
      return NextResponse.json({ opportunityId: imp.opportunityId });
    }

    const stashed = (imp.extracted as (AiExtractResult & { __workspace?: Workspace }) | null) ?? {};
    const { __workspace, ...fields } = stashed;
    const workspace: Workspace = (["DK", "GLOBAL"] as const).includes(
      __workspace as "DK" | "GLOBAL",
    )
      ? (__workspace as Workspace)
      : "DK";

    // Owner profile drives scoring.
    const owner = await db.user.findUnique({ where: { id: ownerId } });
    const weights = (owner?.scoringWeights as Partial<ScoreWeights>) || undefined;
    const budgetMaxDkk = owner?.budgetMaxDkk ?? 100000;

    const title =
      fields.title?.trim() ||
      imp.content.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) ||
      "Community import";
    const organization = fields.organization?.trim() || imp.groupName || undefined;
    const deadline = fields.deadline ? new Date(fields.deadline) : undefined;
    const validDeadline = deadline && !Number.isNaN(deadline.getTime()) ? deadline : undefined;
    const requirements =
      Array.isArray(fields.requirements) && fields.requirements.length
        ? fields.requirements
        : undefined;

    // Score from the candidate fields + pasted content before persisting.
    const breakdown = scoreOpportunity(
      {
        title,
        description: fields.description,
        rawContent: imp.content,
        budgetMin: fields.budgetMin ?? null,
        budgetMax: fields.budgetMax ?? null,
        deadline: validDeadline ?? null,
        organization,
        category: fields.category,
        applicationRoute: fields.applicationRoute ?? "UNKNOWN",
        contacts: fields.contact ? [fields.contact] : [],
      },
      { budgetMaxDkk, weights },
    );
    breakdown.computedAt = new Date().toISOString();

    const opp = await db.opportunity.create({
      data: {
        ownerId,
        title,
        description: fields.description,
        rawContent: imp.content,
        // Never use a contact email as the url — only a real web link. A contact
        // email lives in the contacts relation below.
        url: imp.url || undefined,
        dedupeHash: dedupeHash({
          title,
          url: imp.url || undefined,
          organization,
          description: fields.description,
        }),
        organization,
        location: fields.location,
        country: fields.country ?? "DK",
        category: fields.category,
        workspace,
        budgetMin: fields.budgetMin ?? undefined,
        budgetMax: fields.budgetMax ?? undefined,
        currency: fields.currency ?? "DKK",
        deadline: validDeadline,
        isActive: !validDeadline || validDeadline.getTime() >= Date.now(),
        status: "NEW",
        applicationRoute: fields.applicationRoute ?? "UNKNOWN",
        ingestMethod: "COMMUNITY",
        matchScore: breakdown.total,
        scoreBreakdown: breakdown as object,
        extractedRequirements: requirements as object | undefined,
        contacts: fields.contact?.email || fields.contact?.name
          ? {
              create: [
                {
                  name: fields.contact.name,
                  email: fields.contact.email,
                  phone: fields.contact.phone,
                  role: fields.contact.role,
                  organization,
                },
              ],
            }
          : undefined,
        activities: {
          create: {
            type: "IMPORT",
            message: `Imported from community${imp.groupName ? ` · ${imp.groupName}` : ""}`,
            metadata: { communityImportId: imp.id, author: imp.author ?? undefined },
          },
        },
      },
    });

    await db.communityImport.update({
      where: { id: imp.id },
      data: { opportunityId: opp.id, status: "CONFIRMED" },
    });

    return NextResponse.json({ opportunityId: opp.id });
  } catch (err) {
    return apiError(err);
  }
}
