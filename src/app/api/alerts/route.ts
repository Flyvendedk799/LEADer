import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";
import { getDashboardMetrics } from "@/lib/dashboard";

// Alerts: local, in-app notifications. Email delivery is a future hook —
// when EMAIL_PROVIDER is configured, a DIGEST alert with channel EMAIL would be
// dispatched here instead of (or in addition to) being stored as a LOCAL alert.

const markReadSchema = z.object({ id: z.string().min(1) });
const postSchema = z.object({ type: z.literal("DIGEST") });

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const alerts = await db.alert.findMany({
      where: { ownerId, read: false },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(alerts);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load alerts" },
      { status: 500 },
    );
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update alert" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const json = await req.json();
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Build a simple digest from the current DK pipeline counts.
    const metrics = await getDashboardMetrics(ownerId, "DK");
    const lines = [
      `${metrics.newLeads} new lead${metrics.newLeads === 1 ? "" : "s"}`,
      `${metrics.activeLeads} active`,
      `${metrics.upcomingDeadlines.length} upcoming deadline${metrics.upcomingDeadlines.length === 1 ? "" : "s"}`,
      `${metrics.appliedCount} applied · ${metrics.wonCount} won · ${metrics.lostCount} lost`,
    ];

    const alert = await db.alert.create({
      data: {
        ownerId,
        type: "DIGEST",
        channel: "LOCAL", // EMAIL_PROVIDER future hook: switch to EMAIL + send.
        title: "Your pipeline digest",
        body: lines.join(" · "),
        payload: {
          newLeads: metrics.newLeads,
          activeLeads: metrics.activeLeads,
          upcomingDeadlines: metrics.upcomingDeadlines.length,
          appliedCount: metrics.appliedCount,
          wonCount: metrics.wonCount,
          lostCount: metrics.lostCount,
          pipelineValue: metrics.pipelineValue,
        },
      },
    });

    return NextResponse.json(alert);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate digest" },
      { status: 500 },
    );
  }
}
