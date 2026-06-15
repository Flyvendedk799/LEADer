import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { dispatchForOwner, generateDigest } from "@/lib/alerts/dispatch";
import { apiError } from "@/lib/api";

// Alerts: in-app notification inbox + on-demand generation. When EMAIL_PROVIDER
// is configured, DIGEST/DEADLINE alerts are also delivered by email.

const markReadSchema = z.object({ id: z.string().min(1) });
const postSchema = z.object({
  type: z.enum(["DIGEST", "REMINDERS"]).default("DIGEST"),
  workspace: z.enum(["DK", "GLOBAL"]).optional(),
});

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const alerts = await db.alert.findMany({
      where: { ownerId, read: false },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(alerts);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json();
    const parsed = markReadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    // Scope the update by ownerId so one tenant can't mark another's alerts read.
    const result = await db.alert.updateMany({
      where: { id: parsed.data.id, ownerId },
      data: { read: true },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json();
    const parsed = postSchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.type === "REMINDERS") {
      const { reminders } = await dispatchForOwner(ownerId, { workspace: parsed.data.workspace });
      return NextResponse.json({ type: "REMINDERS", ...reminders });
    }

    const result = await generateDigest(ownerId, parsed.data.workspace ?? "DK");
    return NextResponse.json({ type: "DIGEST", ...result });
  } catch (err) {
    return apiError(err);
  }
}
