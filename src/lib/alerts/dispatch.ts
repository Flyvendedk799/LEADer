import { db } from "@/lib/db";
import { getDashboardMetrics } from "@/lib/dashboard";
import { emailEnabled, sendEmail } from "@/lib/email";
import { renderDeadlineReminder, renderDigest } from "@/lib/email/templates";
import type { Workspace } from "@/lib/types";

// Alert dispatch: generate DEADLINE reminders and DIGEST alerts, persist them as
// Alert rows (the in-app inbox), and deliver by email when a provider is set.

const DAY = 24 * 60 * 60 * 1000;

interface DispatchResult {
  created: number;
  emailed: number;
  provider: string;
}

/** Owners receive a reminder for active opportunities whose deadline is near. */
export async function generateDeadlineReminders(ownerId: string): Promise<DispatchResult> {
  const windowDays = Number(process.env.REMINDER_WINDOW_DAYS || 7);
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * DAY);

  const opps = await db.opportunity.findMany({
    where: {
      ownerId,
      deadline: { gte: now, lte: horizon },
      status: { notIn: ["ARCHIVED", "LOST", "WON"] },
    },
    select: { id: true, title: true, deadline: true, matchScore: true },
    orderBy: { deadline: "asc" },
  });

  // De-dupe: skip opportunities reminded in the last 24h (payload.opportunityId).
  const recent = await db.alert.findMany({
    where: { ownerId, type: "DEADLINE", createdAt: { gte: new Date(now.getTime() - DAY) } },
    select: { payload: true },
  });
  const remindedIds = new Set(
    recent.map((a) => (a.payload as { opportunityId?: string } | null)?.opportunityId).filter(Boolean),
  );

  const due = opps
    .filter((o) => o.deadline && !remindedIds.has(o.id))
    .map((o) => ({
      id: o.id,
      title: o.title,
      deadline: o.deadline as Date,
      matchScore: o.matchScore,
      daysLeft: Math.ceil(((o.deadline as Date).getTime() - now.getTime()) / DAY),
    }));

  if (due.length === 0) return { created: 0, emailed: 0, provider: "none" };

  // One Alert per opportunity (so the in-app inbox is granular + de-dupable).
  for (const o of due) {
    await db.alert.create({
      data: {
        ownerId,
        type: "DEADLINE",
        channel: emailEnabled() ? "EMAIL" : "LOCAL",
        title: `Deadline ${o.daysLeft <= 0 ? "today" : `in ${o.daysLeft} day(s)`}: ${o.title}`,
        body: `${o.title} closes ${o.deadline.toLocaleDateString("da-DK")}.`,
        payload: { opportunityId: o.id, daysLeft: o.daysLeft, deadline: o.deadline.toISOString() },
      },
    });
  }

  // A single grouped email for all due deadlines.
  let emailed = 0;
  let provider = "none";
  if (emailEnabled()) {
    const user = await db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
    if (user?.email) {
      const tpl = renderDeadlineReminder(due);
      const res = await sendEmail({ to: user.email, ...tpl });
      provider = res.provider;
      if (res.delivered) emailed = due.length;
    }
  }

  return { created: due.length, emailed, provider };
}

/** Build + persist a pipeline digest, emailing it when a provider is set. */
export async function generateDigest(ownerId: string, workspace: Workspace = "DK"): Promise<DispatchResult> {
  const metrics = await getDashboardMetrics(ownerId, workspace);
  const tpl = renderDigest(metrics, workspace);

  let emailed = 0;
  let provider = "none";
  if (emailEnabled()) {
    const user = await db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
    if (user?.email) {
      const res = await sendEmail({ to: user.email, ...tpl });
      provider = res.provider;
      if (res.delivered) emailed = 1;
    }
  }

  await db.alert.create({
    data: {
      ownerId,
      type: "DIGEST",
      channel: emailed ? "EMAIL" : "LOCAL",
      title: tpl.subject,
      body: `${metrics.newLeads} new · ${metrics.activeLeads} active · ${metrics.upcomingDeadlines.length} deadline(s) · ${metrics.appliedCount} applied · ${metrics.wonCount} won · ${metrics.lostCount} lost`,
      payload: {
        workspace,
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

  return { created: 1, emailed, provider };
}

/** Run reminders (+ optional digest) for one owner. */
export async function dispatchForOwner(
  ownerId: string,
  opts: { digest?: boolean; workspace?: Workspace } = {},
): Promise<{ reminders: DispatchResult; digest?: DispatchResult }> {
  const reminders = await generateDeadlineReminders(ownerId);
  const digest = opts.digest ? await generateDigest(ownerId, opts.workspace ?? "DK") : undefined;
  return { reminders, digest };
}

/** Multi-tenant scheduler entrypoint: reminders for everyone (+ optional digest). */
export async function dispatchForAllOwners(opts: { digest?: boolean } = {}): Promise<Record<string, unknown>> {
  const owners = await db.user.findMany({ select: { id: true } });
  const out: Record<string, unknown> = {};
  for (const o of owners) {
    out[o.id] = await dispatchForOwner(o.id, opts);
  }
  return out;
}
