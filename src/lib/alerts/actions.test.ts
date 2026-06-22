import { describe, expect, it } from "vitest";

import { alertPatchEmptyMessage, alertPatchSchema, alertPatchWhere } from "./actions";

describe("alert actions", () => {
  it("keeps single-alert handling owner scoped", () => {
    const parsed = alertPatchSchema.parse({ id: "alert-1" });

    expect(alertPatchWhere("owner-1", parsed)).toEqual({ ownerId: "owner-1", id: "alert-1" });
    expect(alertPatchEmptyMessage(parsed)).toBe("Alert not found");
  });

  it("builds bulk unread handling for the current owner", () => {
    const parsed = alertPatchSchema.parse({ all: true });

    expect(alertPatchWhere("owner-1", parsed)).toEqual({ ownerId: "owner-1", read: false });
    expect(alertPatchEmptyMessage(parsed)).toBe("No unread alerts to handle");
  });

  it("deduplicates explicit alert batches", () => {
    const parsed = alertPatchSchema.parse({ ids: ["alert-1", "alert-1", "alert-2"] });

    expect(alertPatchWhere("owner-1", parsed)).toEqual({
      ownerId: "owner-1",
      id: { in: ["alert-1", "alert-2"] },
    });
  });
});
