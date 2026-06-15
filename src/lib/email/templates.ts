import type { DashboardMetrics } from "@/lib/types";
import type { EmailMessage } from "./index";

// Inline-styled, client-safe HTML email templates. Each returns the pieces of an
// EmailMessage except `to`, which the dispatcher fills in.

type Rendered = Omit<EmailMessage, "to">;

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c);
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0f17;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e6edf3;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="font-size:18px;font-weight:700;color:#3b82f6;margin-bottom:16px;">🎯 LEADer</div>
    <h1 style="font-size:20px;margin:0 0 16px;color:#e6edf3;">${esc(title)}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #1f2937;margin:24px 0;">
    <p style="font-size:12px;color:#8b949e;">You're receiving this because email alerts are enabled for your LEADer workspace.
    <a href="${appUrl()}/settings" style="color:#3b82f6;">Manage preferences</a>.</p>
  </div></body></html>`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;">${esc(label)}</a>`;
}

export function renderDigest(metrics: DashboardMetrics, workspace: string): Rendered {
  const dl = metrics.upcomingDeadlines.slice(0, 5);
  const best = metrics.bestMatches.slice(0, 5);

  const list = <T extends { id: string; title: string }>(items: T[], suffix?: (i: T) => string) =>
    items.length
      ? `<ul style="padding-left:18px;margin:8px 0;">${items
          .map(
            (i) =>
              `<li style="margin:4px 0;"><a href="${appUrl()}/opportunities/${i.id}" style="color:#e6edf3;">${esc(i.title)}</a>${suffix ? ` <span style="color:#8b949e;">${suffix(i)}</span>` : ""}</li>`,
          )
          .join("")}</ul>`
      : `<p style="color:#8b949e;margin:8px 0;">None.</p>`;

  const html = layout(
    `Your ${esc(workspace)} pipeline digest`,
    `<p style="color:#c9d1d9;">${metrics.newLeads} new · ${metrics.activeLeads} active · ${metrics.appliedCount} applied · ${metrics.wonCount} won · ${metrics.lostCount} lost</p>
     <h3 style="font-size:15px;margin:20px 0 4px;">⏰ Upcoming deadlines</h3>
     ${list(dl, (i) => `— ${new Date(i.deadline).toLocaleDateString("da-DK")}`)}
     <h3 style="font-size:15px;margin:20px 0 4px;">⭐ Best matches</h3>
     ${list(best, (i) => `— score ${i.matchScore ?? "—"}`)}
     <p style="margin:24px 0 0;">${button("Open dashboard", appUrl())}</p>`,
  );

  const text = [
    `Your ${workspace} pipeline digest`,
    `${metrics.newLeads} new · ${metrics.activeLeads} active · ${metrics.appliedCount} applied · ${metrics.wonCount} won · ${metrics.lostCount} lost`,
    "",
    "Upcoming deadlines:",
    ...(dl.length ? dl.map((d) => `- ${d.title} (${new Date(d.deadline).toLocaleDateString("da-DK")})`) : ["- None"]),
    "",
    "Best matches:",
    ...(best.length ? best.map((b) => `- ${b.title} (score ${b.matchScore ?? "—"})`) : ["- None"]),
    "",
    `Open: ${appUrl()}`,
  ].join("\n");

  return { subject: `LEADer digest — ${metrics.newLeads} new, ${metrics.upcomingDeadlines.length} deadline(s)`, html, text };
}

export function renderDeadlineReminder(
  items: { id: string; title: string; deadline: Date; daysLeft: number; matchScore: number | null }[],
): Rendered {
  const rows = items
    .map(
      (i) =>
        `<li style="margin:6px 0;"><a href="${appUrl()}/opportunities/${i.id}" style="color:#e6edf3;font-weight:600;">${esc(i.title)}</a><br>
         <span style="color:#8b949e;font-size:13px;">${i.daysLeft <= 0 ? "due today" : `${i.daysLeft} day(s) left`} · ${i.deadline.toLocaleDateString("da-DK")} · score ${i.matchScore ?? "—"}</span></li>`,
    )
    .join("");

  const html = layout(
    `${items.length} deadline${items.length === 1 ? "" : "s"} approaching`,
    `<ul style="padding-left:18px;margin:8px 0;list-style:none;">${rows}</ul>
     <p style="margin:24px 0 0;">${button("Review opportunities", `${appUrl()}/opportunities?activeOnly=true&sort=deadline&order=asc`)}</p>`,
  );

  const text = [
    `${items.length} deadline(s) approaching:`,
    "",
    ...items.map((i) => `- ${i.title} — ${i.daysLeft <= 0 ? "due today" : `${i.daysLeft} day(s) left`} (${i.deadline.toLocaleDateString("da-DK")})`),
    "",
    `Review: ${appUrl()}/opportunities?activeOnly=true&sort=deadline&order=asc`,
  ].join("\n");

  return { subject: `⏰ ${items.length} LEADer deadline${items.length === 1 ? "" : "s"} approaching`, html, text };
}
