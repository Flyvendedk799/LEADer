import { db } from "@/lib/db";
import { getDashboardMetrics } from "@/lib/dashboard";
import { emailEnabled, sendEmail } from "@/lib/email";
import { renderDeadlineReminder, renderDigest } from "@/lib/email/templates";
import type { Workspace } from "@/lib/types";

// Alert dispatch: generate DEADLINE reminders and DIGEST alerts, persist them as
// Alert rows (the in-app inbox), and deliver by email when a provider is set.

const DAY = 24 * 60 * 60 * 1000;
const OPEN_DEAL_STATUSES = ["DISCOVERED", "QUALIFYING", "INTERESTING", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const;

export interface DispatchResult {
  created: number;
  emailed: number;
  provider: string;
}

function remindedIds(rows: { payload: unknown }[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    const payload = row.payload as { dealId?: string; opportunityId?: string } | null;
    if (payload?.dealId) ids.add(payload.dealId);
    if (payload?.opportunityId) ids.add(payload.opportunityId);
  }
  return ids;
}

/** Owners receive a reminder for open deals whose deadline is near. */
export async function generateDeadlineReminders(ownerId: string): Promise<DispatchResult> {
  const windowDays = Number(process.env.REMINDER_WINDOW_DAYS || 7);
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * DAY);

  const deals = await db.deal.findMany({
    where: {
      ownerId,
      deadline: { gte: now, lte: horizon },
      status: { in: [...OPEN_DEAL_STATUSES] },
    },
    select: { id: true, title: true, deadline: true, matchScore: true, pursuitScore: true, legacyOpportunityId: true },
    orderBy: { deadline: "asc" },
  });

  const recent = await db.alert.findMany({
    where: { ownerId, type: "DEADLINE", createdAt: { gte: new Date(now.getTime() - DAY) } },
    select: { payload: true },
  });
  const reminded = remindedIds(recent);

  const due = deals
    .filter((deal) => deal.deadline && !reminded.has(deal.id) && !(deal.legacyOpportunityId && reminded.has(deal.legacyOpportunityId)))
    .map((deal) => ({
      id: deal.id,
      title: deal.title,
      deadline: deal.deadline as Date,
      matchScore: deal.pursuitScore ?? deal.matchScore,
      legacyOpportunityId: deal.legacyOpportunityId,
      daysLeft: Math.ceil(((deal.deadline as Date).getTime() - now.getTime()) / DAY),
    }));

  if (due.length === 0) return { created: 0, emailed: 0, provider: "none" };

  // Send a single grouped email first, so each Alert's channel reflects whether
  // it was actually delivered (not merely that a provider is configured).
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
  const channel = emailed > 0 ? "EMAIL" : "LOCAL";

  // One Alert per opportunity (so the in-app inbox is granular + de-dupable).
  for (const o of due) {
    await db.alert.create({
      data: {
        ownerId,
        type: "DEADLINE",
        channel,
        title: `Deadline ${o.daysLeft <= 0 ? "today" : `in ${o.daysLeft} day(s)`}: ${o.title}`,
        body: `${o.title} closes ${o.deadline.toLocaleDateString("da-DK")}.`,
        payload: {
          dealId: o.id,
          opportunityId: o.legacyOpportunityId ?? undefined,
          daysLeft: o.daysLeft,
          deadline: o.deadline.toISOString(),
        },
      },
    });
  }

  return { created: due.length, emailed, provider };
}

/** Inbox rows for deals that state a next action, have no open task, and are past due or stale. */
export async function generateNeedsAction(ownerId: string): Promise<DispatchResult> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 7 * DAY);
  const deals = await db.deal.findMany({
    where: {
      ownerId,
      status: { in: [...OPEN_DEAL_STATUSES] },
      nextAction: { not: null },
      tasks: { none: { status: "OPEN" } },
      OR: [{ deadline: { lt: now } }, { updatedAt: { lt: staleBefore } }],
    },
    select: { id: true, title: true, nextAction: true },
    take: 20,
  });
  const recent = await db.alert.findMany({
    where: { ownerId, type: "NEEDS_ACTION", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
    select: { payload: true },
  });
  const reminded = remindedIds(recent);
  const due = deals.filter((deal) => deal.nextAction?.trim() && !reminded.has(deal.id));
  for (const deal of due) {
    await db.alert.create({
      data: {
        ownerId,
        type: "NEEDS_ACTION",
        channel: "LOCAL",
        title: `Needs action: ${deal.title}`,
        body: deal.nextAction,
        payload: { dealId: deal.id },
      },
    });
  }
  return { created: due.length, emailed: 0, provider: "none" };
}

/** Build + persist a pipeline digest, emailing high-match deals when a provider is set. */
export async function generateDigest(ownerId: string, workspace: Workspace = "DK"): Promise<DispatchResult> {
  const metrics = await getDashboardMetrics(ownerId, workspace);
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * DAY);
  const [deadlines, matches] = await Promise.all([
    db.deal.findMany({
      where: {
        ownerId,
        workspace,
        status: { in: [...OPEN_DEAL_STATUSES] },
        deadline: { gte: now, lte: horizon },
      },
      orderBy: { deadline: "asc" },
      take: 5,
      select: { id: true, title: true, deadline: true, matchScore: true, pursuitScore: true },
    }),
    db.discoveryCandidate.findMany({
      where: {
        ownerId,
        workspace,
        status: "NEW",
        OR: [{ matchScore: { gte: 80 } }, { pursuitScore: { gte: 80 } }],
      },
      orderBy: { pursuitScore: "desc" },
      take: 5,
      select: { id: true, title: true, matchScore: true, pursuitScore: true },
    }),
  ]);
  const tpl = renderDigest(
    {
      ...metrics,
      upcomingDeadlines: deadlines.flatMap((deal) =>
        deal.deadline
          ? [{
              id: deal.id,
              title: deal.title,
              deadline: deal.deadline.toISOString(),
              matchScore: deal.pursuitScore ?? deal.matchScore,
            }]
          : [],
      ),
      bestMatches: matches.map((deal) => ({
        id: deal.id,
        title: deal.title,
        matchScore: deal.pursuitScore ?? deal.matchScore,
        type: "candidate" as const,
      })),
    },
    workspace,
  );

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
): Promise<{ reminders: DispatchResult; needsAction: DispatchResult; digest?: DispatchResult }> {
  const reminders = await generateDeadlineReminders(ownerId);
  const needsAction = await generateNeedsAction(ownerId);
  const digest = opts.digest ? await generateDigest(ownerId, opts.workspace ?? "DK") : undefined;
  return { reminders, needsAction, digest };
}

/** Multi-tenant scheduler entrypoint: reminders for everyone (+ optional digest). */
export async function dispatchForAllOwners(
  opts: { digest?: boolean; workspace?: Workspace } = {},
): Promise<Record<string, unknown>> {
  const owners = await db.user.findMany({ select: { id: true } });
  const out: Record<string, unknown> = {};
  for (const o of owners) {
    out[o.id] = await dispatchForOwner(o.id, opts);
  }
  return out;
}
