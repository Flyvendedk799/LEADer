import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { buildStoredAiKeys, publicAiKeys } from "@/lib/ai/keys";
import { settingsSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────
// Settings API — reads/updates the current owner's profile + preferences.
//
// User-supplied AI keys are encrypted before being stored in the `aiKeys` JSON
// blob. The API only returns masked key metadata to the browser.
// ─────────────────────────────────────────────────────────────────────────

function safeUser<T extends { aiKeys?: unknown }>(user: T) {
  return {
    ...user,
    aiKeys: publicAiKeys(user.aiKeys),
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No user found" }, { status: 404 });
    }
    return NextResponse.json(safeUser(user));
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const json = await req.json();
    const parsed = settingsSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid settings", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    // Build a partial update so only provided fields are touched. JSON blobs are
    // cast to Prisma.InputJsonValue; secrets never reach here (see header note).
    const data: Prisma.UserUpdateInput = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.headline !== undefined) data.headline = d.headline;
    if (d.bio !== undefined) data.bio = d.bio;
    if (d.preferredProjectTypes !== undefined) data.preferredProjectTypes = d.preferredProjectTypes;
    if (d.excludedCategories !== undefined) data.excludedCategories = d.excludedCategories;
    if (d.budgetMaxDkk !== undefined) data.budgetMaxDkk = d.budgetMaxDkk;
    if (d.preferredCurrency !== undefined) data.preferredCurrency = d.preferredCurrency;
    if (d.scoringWeights !== undefined) data.scoringWeights = d.scoringWeights as Prisma.InputJsonValue;
    if (d.exportPrefs !== undefined) data.exportPrefs = d.exportPrefs as Prisma.InputJsonValue;
    if (d.aiKeys !== undefined) {
      data.aiKeys = buildStoredAiKeys(d.aiKeys, user.aiKeys) as unknown as Prisma.InputJsonValue;
    }
    if (d.completeOnboarding) data.onboardedAt = new Date();

    const updated = await db.user.update({ where: { id: user.id }, data });
    return NextResponse.json(safeUser(updated));
  } catch (err) {
    return apiError(err);
  }
}
