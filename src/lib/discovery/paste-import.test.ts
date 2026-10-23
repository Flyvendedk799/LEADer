import { describe, expect, it } from "vitest";
import { heuristicLeads, parseAiLeads, pastedLeadToCandidate } from "./paste-import";

describe("paste import", () => {
  it("splits a ChatGPT-style list into leads with links", () => {
    const leads = heuristicLeads(`1. **Acme ApS** - needs a reporting tool
   https://acme.dk/careers/it
   Wants dashboards for finance.

2. **Beta Holding**: building an internal portal
- Contact via https://beta.dk/kontakt.`);
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({ title: "Acme ApS - needs a reporting tool", url: "https://acme.dk/careers/it" });
    expect(leads[1]?.title).toBe("Beta Holding: building an internal portal");
  });

  it("validates model output and never keeps an invented link", () => {
    const leads = parseAiLeads({
      leads: [
        { title: "Good", url: "see their website", deadline: "not a date", budgetMin: -5, organization: "X" },
        { title: "", url: "https://skip.me" },
        { title: "Linked", url: "https://ok.dk/path." },
      ],
    });
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({ title: "Good", organization: "X" });
    expect(leads[0]?.url).toBeUndefined();
    expect(leads[0]?.deadline).toBeUndefined();
    expect(leads[0]?.budgetMin).toBeUndefined();
    expect(leads[1]?.url).toBe("https://ok.dk/path");
  });

  it("builds a scored candidate flagged as pasted", () => {
    const c = pastedLeadToCandidate({ title: "Acme", description: "Needs AI automation" }, 0, {
      workspace: "DK",
      label: "Pasted research",
    });
    expect(c.provider).toBe("pasted");
    expect(c.matchScore).toBeGreaterThanOrEqual(0);
    expect(c.scoreBreakdown.components.length).toBeGreaterThan(0);
  });
});
