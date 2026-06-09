import { describe, expect, it } from "vitest";
import { scoreOpportunity } from "./index";
import { DEFAULT_WEIGHTS } from "./config";

describe("scoreOpportunity", () => {
  it("returns a 0–100 score with a component breakdown", () => {
    const r = scoreOpportunity({
      title: "Fullstack MVP for AI startup",
      description: "Voucher-funded MVP build with Next.js, deadline in 3 weeks, contact founder directly.",
      budgetMax: 80000,
      deadline: new Date(Date.now() + 21 * 86400000),
      applicationRoute: "DIRECT",
      contacts: [{ email: "founder@startup.dk" }],
    });
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.components.length).toBe(Object.keys(DEFAULT_WEIGHTS).length);
  });

  it("scores a small, active, on-profile lead higher than an oversized expired one", () => {
    const good = scoreOpportunity({
      title: "AI MVP fullstack assignment for funded startup",
      description: "Startup voucher project, build MVP, apply directly. erhvervshus tilskud.",
      budgetMax: 70000,
      deadline: new Date(Date.now() + 14 * 86400000),
      applicationRoute: "DIRECT",
      contacts: [{ email: "x@y.dk" }],
    });
    const bad = scoreOpportunity({
      title: "Enterprise hardware procurement",
      description: "Large multi-year manufacturing contract.",
      budgetMax: 5_000_000,
      deadline: new Date(Date.now() - 5 * 86400000),
      applicationRoute: "UNKNOWN",
    });
    expect(good.total).toBeGreaterThan(bad.total);
  });

  it("treats a just-expired deadline as expired (no 'today' rounding)", () => {
    const base = {
      title: "AI MVP build",
      description: "ai mvp startup",
      budgetMax: 70000,
      applicationRoute: "DIRECT" as const,
    };
    const justExpired = scoreOpportunity({ ...base, deadline: new Date(Date.now() - 5 * 3600_000) });
    const future = scoreOpportunity({ ...base, deadline: new Date(Date.now() + 10 * 86400_000) });
    const expiredComp = justExpired.components.find((c) => c.criterion === "activeDeadline")!;
    expect(expiredComp.raw).toBe(0); // expired, not rounded up to active
    expect(future.total).toBeGreaterThan(justExpired.total);
  });

  it("respects custom weights", () => {
    const o = { title: "AI build", description: "ai mvp", budgetMax: 50000 };
    const a = scoreOpportunity(o, { weights: { aiProductRelevance: 1 } });
    const b = scoreOpportunity(o, { weights: { ambition: 1 } });
    expect(a.total).not.toBe(b.total);
  });
});
