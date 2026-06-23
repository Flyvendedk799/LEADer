import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    discoveryCandidate: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { DUPLICATE_CANDIDATE_REASON } from "./candidate-dedupe";
import { dismissInvalidNewLaneCandidates } from "./lane-hygiene";
import { DEFAULT_DISCOVERY_LANES } from "./lanes";

describe("lane hygiene actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.discoveryCandidate.updateMany.mockResolvedValue({ count: 1 });
  });

  it("marks older active tender duplicates without hiding the newest review item", async () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const deadline = new Date("2026-06-29T06:00:00.000Z");
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      {
        id: "newer-candidate",
        lane,
        title: "Intranet",
        organization: "METROSELSKABET I/S",
        deadline,
        url: "https://udbud.dk/detaljevisning?noticeId=new",
      },
      {
        id: "older-candidate",
        lane,
        title: "Intranet",
        organization: "METROSELSKABET I/S",
        deadline,
        url: "https://udbud.dk/detaljevisning?noticeId=old",
      },
    ]);

    const result = await dismissInvalidNewLaneCandidates("owner-1");

    expect(result).toMatchObject({ dismissed: 0, duplicated: 1 });
    expect(mocks.db.discoveryCandidate.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.db.discoveryCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: "older-candidate", ownerId: "owner-1", status: "NEW" },
      data: {
        status: "DUPLICATE",
        reasons: { push: DUPLICATE_CANDIDATE_REASON },
      },
    });
  });
});
