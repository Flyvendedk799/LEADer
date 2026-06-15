import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardMetrics } from "@/lib/types";
import { emailEnabled, sendEmail } from "./index";
import { renderDeadlineReminder, renderDigest } from "./templates";

const metrics: DashboardMetrics = {
  newLeads: 3,
  activeLeads: 7,
  upcomingDeadlines: [{ id: "o1", title: "MVP build", deadline: new Date("2026-03-01").toISOString(), matchScore: 88 }],
  bestMatches: [{ id: "o2", title: "AI prototype", matchScore: 91 }],
  watchlistCount: 2,
  appliedCount: 1,
  wonCount: 4,
  lostCount: 2,
  pipelineValue: 250000,
  bySource: [],
  byCategory: [],
  byStatus: [],
};

afterEach(() => {
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;
  vi.restoreAllMocks();
});

describe("email templates", () => {
  it("renders a digest with subject, html and text", () => {
    const t = renderDigest(metrics, "DK");
    expect(t.subject).toMatch(/digest/i);
    expect(t.html).toContain("MVP build");
    expect(t.html).toContain("AI prototype");
    expect(t.text).toContain("MVP build");
    expect(t.html).toContain("/opportunities/o1");
  });

  it("renders a deadline reminder", () => {
    const t = renderDeadlineReminder([
      { id: "o9", title: "Voucher task", deadline: new Date("2026-02-10"), daysLeft: 3, matchScore: 70 },
    ]);
    expect(t.subject).toMatch(/deadline/i);
    expect(t.html).toContain("Voucher task");
    expect(t.text).toContain("3 day(s) left");
  });

  it("escapes HTML in titles", () => {
    const t = renderDeadlineReminder([
      { id: "x", title: "<script>alert(1)</script>", deadline: new Date("2026-02-10"), daysLeft: 1, matchScore: null },
    ]);
    expect(t.html).not.toContain("<script>alert(1)</script>");
    expect(t.html).toContain("&lt;script&gt;");
  });
});

describe("email provider selection", () => {
  it("is disabled with no provider configured (no-op send)", async () => {
    expect(emailEnabled()).toBe(false);
    const res = await sendEmail({ to: "a@b.dk", subject: "s", html: "h", text: "t" });
    expect(res.delivered).toBe(false);
    expect(res.provider).toBe("none");
  });

  it("console provider delivers without network", async () => {
    process.env.EMAIL_PROVIDER = "console";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(emailEnabled()).toBe(true);
    const res = await sendEmail({ to: "a@b.dk", subject: "s", html: "h", text: "t" });
    expect(res.delivered).toBe(true);
    expect(res.provider).toBe("console");
    expect(log).toHaveBeenCalled();
  });

  it("resend provider posts to the API and parses the id", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_API_KEY = "re_test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }),
    );
    const res = await sendEmail({ to: "a@b.dk", subject: "s", html: "h", text: "t" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
    expect(res.delivered).toBe(true);
    expect(res.id).toBe("msg_123");
  });

  it("resend failure returns an error result, not a throw", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_API_KEY = "re_test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 422 }));
    const res = await sendEmail({ to: "a@b.dk", subject: "s", html: "h", text: "t" });
    expect(res.delivered).toBe(false);
    expect(res.error).toMatch(/422/);
  });
});
