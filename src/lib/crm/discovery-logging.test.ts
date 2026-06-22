import { describe, expect, it } from "vitest";

import {
  discoveryCountLabel,
  discoveryLogEntry,
  discoveryQueueLogMessage,
  formatDiscoveryElapsed,
} from "./discovery-logging";

describe("discovery logging helpers", () => {
  it("formats elapsed discovery time for mission logs", () => {
    expect(formatDiscoveryElapsed(2400)).toBe("2s");
    expect(formatDiscoveryElapsed(64_100)).toBe("1m 04s");
    expect(formatDiscoveryElapsed(-10)).toBe("0s");
  });

  it("describes queue background state", () => {
    expect(discoveryQueueLogMessage("mission-1", { activeMissionId: "mission-1", queuedMissionIds: [] })).toMatch(
      /keep running/,
    );
    expect(discoveryQueueLogMessage("mission-2", { activeMissionId: "mission-1", queuedMissionIds: ["mission-2"] })).toBe(
      "Background worker queued mission at position 1; it will run after active missions.",
    );
  });

  it("builds timestamped log entries and count labels", () => {
    expect(discoveryLogEntry("Queued", new Date("2026-06-22T10:15:00.000Z"))).toBe(
      "2026-06-22T10:15:00.000Z Queued",
    );
    expect(discoveryCountLabel(1, "candidate")).toBe("1 candidate");
    expect(discoveryCountLabel(3, "candidate")).toBe("3 candidates");
  });
});
