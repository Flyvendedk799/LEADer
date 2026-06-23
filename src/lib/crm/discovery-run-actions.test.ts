import { describe, expect, it } from "vitest";

import {
  discoveryMissionCanRerun,
  discoveryMissionInputMatchesActiveRun,
  discoveryMissionRerunBlockedMessage,
} from "./discovery-run-actions";

describe("discovery run actions", () => {
  it("only allows finished discovery missions to be rerun", () => {
    expect(discoveryMissionCanRerun("QUEUED")).toBe(false);
    expect(discoveryMissionCanRerun("RUNNING")).toBe(false);
    expect(discoveryMissionCanRerun("SUCCESS")).toBe(true);
    expect(discoveryMissionCanRerun("ERROR")).toBe(true);
    expect(discoveryMissionCanRerun("CANCELED")).toBe(true);
  });

  it("explains why live discovery missions cannot be rerun", () => {
    expect(discoveryMissionRerunBlockedMessage("RUNNING")).toBe("Wait for this discovery mission to finish before rerunning it.");
    expect(discoveryMissionRerunBlockedMessage("SUCCESS")).toBeNull();
  });

  it("matches active discovery missions by normalized run input", () => {
    expect(
      discoveryMissionInputMatchesActiveRun(
        {
          laneId: "lane-1",
          query: " Software   Udbud ",
          freeformBrief: "Find tenders",
          useAiPlanner: true,
          searchMode: "focused",
          queryCount: 4,
          requiredTerms: ["AI", "drift"],
          excludedTerms: ["jobs"],
          workspace: "DK",
          maxResults: 12,
          includeWeb: true,
          includeSources: false,
          provider: "auto",
        },
        {
          status: "RUNNING",
          finishedAt: null,
          workspace: "DK",
          input: {
            laneId: "lane-1",
            query: "software udbud",
            freeformBrief: "Find tenders",
            useAiPlanner: true,
            searchMode: "focused",
            queryCount: 4,
            requiredTerms: ["drift", "AI"],
            excludedTerms: ["jobs"],
            workspace: "DK",
            maxResults: 12,
            includeWeb: true,
            includeSources: false,
            provider: "auto",
          },
        },
      ),
    ).toBe(true);
  });

  it("uses the active mission workspace when the queued input omitted workspace", () => {
    expect(
      discoveryMissionInputMatchesActiveRun(
        {
          laneId: "lane-1",
          query: "international ai grants",
          maxResults: 12,
          includeWeb: true,
          includeSources: true,
          provider: "auto",
        },
        {
          status: "QUEUED",
          finishedAt: null,
          workspace: "GLOBAL",
          input: {
            laneId: "lane-1",
            query: "International AI grants",
            maxResults: 12,
            includeWeb: true,
            includeSources: true,
            provider: "auto",
          },
        },
      ),
    ).toBe(true);
  });

  it("does not match finished or materially different discovery missions", () => {
    const input = {
      laneId: "lane-1",
      query: "software udbud",
      workspace: "DK" as const,
      maxResults: 12,
      includeWeb: true,
      includeSources: false,
      provider: "auto" as const,
    };

    expect(
      discoveryMissionInputMatchesActiveRun(input, {
        status: "SUCCESS",
        finishedAt: new Date("2026-06-23T10:00:00.000Z"),
        input,
      }),
    ).toBe(false);
    expect(
      discoveryMissionInputMatchesActiveRun(input, {
        status: "QUEUED",
        finishedAt: null,
        input: { ...input, includeSources: true },
      }),
    ).toBe(false);
  });
});
