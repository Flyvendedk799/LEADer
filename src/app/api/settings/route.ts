import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireOwnerId } from "@/lib/auth";
import { settingsSchema } from "@/lib/validators";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────
// Settings API — reads/updates the current owner's profile + preferences.
//
// SECURITY NOTE: secret API keys (e.g. LLM_API_KEY) belong in .env, NOT here.
// The `aiKeys` JSON only stores NON-SECRET config (provider / baseUrl / model)
// so the UI can show which endpoint is wired up without ever holding a secret.
// ─────────────────────────────────────────────────────────────────────────

// Never echo arbitrary secret config back to the client. Replace aiKeys with
// only the safe, non-secret subset (provider / baseUrl / model).
function safeUser<T extends { aiKeys?: unknown }>(user: T) {
  return {
    ...user,
    aiKeys: user.aiKeys
      ? {
          provider: (user.aiKeys as { provider?: unknown }).provider ?? null,
          baseUrl: (user.aiKeys as { baseUrl?: unknown }).baseUrl ?? null,
          model: (user.aiKeys as { model?: unknown }).model ?? null,
        }
      : null,
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No user found" }, { status: 404 });
    }
    return NextResponse.json(safeUser(user));
  } catch {
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ownerId = await requireOwnerId();
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
    if (d.aiKeys !== undefined) data.aiKeys = d.aiKeys as Prisma.InputJsonValue;

    const user = await db.user.update({ where: { id: ownerId }, data });
    return NextResponse.json(safeUser(user));
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
