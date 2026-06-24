import { describe, expect, it } from "vitest";

import { discoveryMissionHistoryPath } from "./workflow-discovery-mission-queue";

describe("workflow discovery mission queue", () => {
  it("builds server-side history search URLs", () => {
    expect(discoveryMissionHistoryPath(20)).toBe("/api/discovery/runs?limit=20");
    expect(discoveryMissionHistoryPath(100, " software udbud ")).toBe(
      "/api/discovery/runs?limit=100&q=software+udbud",
    );
  });
});
