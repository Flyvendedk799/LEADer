import { describe, expect, it } from "vitest";

import {
  discoveryCountLabel,
  discoveryPhaseTimingSummary,
  discoveryLiveQueueCancelMessage,
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

  it("summarizes discovery phase timing in one line", () => {
    expect(discoveryPhaseTimingSummary({
      prepareMs: 2400,
      searchMs: 64_100,
      persistMs: 950,
      totalMs: 67_450,
    })).toBe("prepare 2s, search 1m 04s, save 1s, total 1m 07s");
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

  it("summarizes live queue cancellation", () => {
    expect(discoveryLiveQueueCancelMessage(1)).toBe("1 mission stopped");
    expect(discoveryLiveQueueCancelMessage(3)).toBe("3 missions stopped");
  });
});
