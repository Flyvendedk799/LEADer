import { describe, expect, it } from "vitest";

import {
  discoveryCandidateBulkActionSchema,
  discoveryCandidateBulkEmptyMessage,
  discoveryCandidateBulkIds,
  discoveryCandidateBulkStatus,
  discoveryCandidateBulkUpdateData,
  discoveryCandidateBulkWhere,
} from "./candidate-actions";

describe("discovery candidate bulk actions", () => {
  it("keeps explicit candidate batches owner scoped", () => {
    const parsed = discoveryCandidateBulkActionSchema.parse({
      ids: ["candidate-1", "candidate-1", "candidate-2"],
      action: "review",
    });

    expect(discoveryCandidateBulkIds(parsed)).toEqual(["candidate-1", "candidate-2"]);
    expect(discoveryCandidateBulkWhere("owner-1", parsed)).toEqual({
      ownerId: "owner-1",
      id: { in: ["candidate-1", "candidate-2"] },
    });
  });

  it("builds status updates for review and dismissal actions", () => {
    const review = discoveryCandidateBulkActionSchema.parse({ ids: ["candidate-1"], action: "review" });
    const dismiss = discoveryCandidateBulkActionSchema.parse({
      ids: ["candidate-2"],
      action: "dismiss",
      reason: "Not a fit right now",
    });

    expect(discoveryCandidateBulkStatus(review)).toBe("REVIEWED");
    expect(discoveryCandidateBulkUpdateData(review)).toEqual({ status: "REVIEWED" });
    expect(discoveryCandidateBulkUpdateData(dismiss)).toEqual({
      status: "DISMISSED",
      dismissalReason: "Not a fit right now",
    });
  });

  it("keeps bulk save on the deal-creation path", () => {
    const save = discoveryCandidateBulkActionSchema.parse({ ids: ["candidate-1"], action: "save" });

    expect(discoveryCandidateBulkStatus(save)).toBeNull();
    expect(() => discoveryCandidateBulkUpdateData(save)).toThrow("Bulk save must use saveCandidateAsDeal");
    expect(discoveryCandidateBulkEmptyMessage(save)).toBe("No matching candidates to save");
  });

  it("rejects empty candidate batches", () => {
    expect(() => discoveryCandidateBulkActionSchema.parse({ ids: [], action: "review" })).toThrow();
  });
});
