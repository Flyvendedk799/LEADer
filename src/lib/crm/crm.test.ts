import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVERY_LANES, laneFit, laneMissionQueries, missionQuery } from "./lanes";
import { confidenceScore, pursuitScore } from "./scoring";

describe("CRM discovery lanes", () => {
  it("ships the six initial client-acquisition lanes", () => {
    expect(DEFAULT_DISCOVERY_LANES.map((lane) => lane.slug)).toEqual([
      "funded-work",
      "direct-startup-mvp",
      "sme-ai-automation",
      "tenders-procurement",
      "community-manual",
      "warm-network",
    ]);
  });

  it("keeps community and warm-network lanes manual-first", () => {
    const community = DEFAULT_DISCOVERY_LANES.find((lane) => lane.slug === "community-manual");
    const warm = DEFAULT_DISCOVERY_LANES.find((lane) => lane.slug === "warm-network");
    expect(community?.sourceTypes).toEqual(["FACEBOOK_MANUAL", "UPLOAD", "MANUAL"]);
    expect(warm?.sourceTypes).toContain("MANUAL");
  });

  it("builds a mission query from lane defaults plus refinement", () => {
    const lane = DEFAULT_DISCOVERY_LANES[1];
    expect(missionQuery(lane, "Copenhagen founders")).toContain("Copenhagen founders");
    expect(missionQuery(lane)).toBe(lane.queryTemplates[0]);
  });

  it("expands a lane into several deduped mission probes", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "sme-ai-automation")!;
    const queries = laneMissionQueries(lane, "finance reporting workflows", 4);
    expect(queries).toHaveLength(4);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries.every((query) => query.includes("finance reporting workflows") || query.includes(lane.name))).toBe(true);
  });

  it("rewards lane evidence and penalizes negative filters", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "direct-startup-mvp")!;
    const strong = laneFit(lane, {
      title: "Founder needs MVP prototype and fullstack technical partner",
      description: "Pre-seed startup wants a product roadmap and prototype sprint this month.",
      organization: "Nordic Founder Studio",
      url: "https://example.com",
      sourceKind: "web-search",
    });
    const weak = laneFit(lane, {
      title: "Unpaid internship job posting only",
      description: "Equity only community role with no paid build scope.",
      sourceKind: "web-search",
    });
    expect(strong.delta).toBeGreaterThan(weak.delta);
    expect(strong.evidenceMatches.length).toBeGreaterThan(weak.evidenceMatches.length);
    expect(weak.blockedKeywords.length).toBeGreaterThan(0);
  });
});

describe("CRM scoring helpers", () => {
  it("rewards candidates with concrete evidence", () => {
    const weak = confidenceScore({});
    const strong = confidenceScore({
      hasUrl: true,
      hasBudget: true,
      hasDeadline: true,
      hasOrganization: true,
      evidenceCount: 2,
      sourceKind: "source-scan",
    });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(100);
  });

  it("combines match, confidence, urgency and priority into pursuit score", () => {
    const soon = new Date(Date.now() + 3 * 86400000);
    const later = new Date(Date.now() + 120 * 86400000);
    expect(pursuitScore({ matchScore: 80, confidenceScore: 80, deadline: soon, priority: 2 }))
      .toBeGreaterThan(pursuitScore({ matchScore: 80, confidenceScore: 80, deadline: later, priority: 0 }));
  });
});
