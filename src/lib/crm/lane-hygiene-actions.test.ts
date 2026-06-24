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

  it("normalizes old auto-dismissed candidate scores", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      {
        id: "dismissed-linkedin",
        status: "DISMISSED",
        dismissalReason: "Auto-dismissed by lane guard: social/profile result, not a tender notice",
        matchScore: 92,
        confidenceScore: 88,
        pursuitScore: 95,
        lane: DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!,
        title: "Dennis på LinkedIn: Jeg har fundet et software udbud",
        url: "https://dk.linkedin.com/posts/dennis-software-udbud",
        reasons: [],
        signals: [],
      },
    ]);

    const result = await dismissInvalidNewLaneCandidates("owner-1");

    expect(result).toMatchObject({ dismissed: 0, duplicated: 0, normalizedRejected: 1 });
    expect(mocks.db.discoveryCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: "dismissed-linkedin", ownerId: "owner-1", status: "DISMISSED" },
      data: {
        dismissalReason: "Auto-dismissed by lane guard: social/profile result, not a tender notice",
        matchScore: 0,
        confidenceScore: 0,
        pursuitScore: 0,
        reasons: { push: "Rejected by lane guard: social/profile result, not a tender notice" },
        signals: { push: "rejected:social/profile result, not a tender notice" },
      },
    });
  });

  it("repairs older dismissed invalid rows that predate auto-dismiss reasons", async () => {
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      {
        id: "dismissed-archive",
        status: "DISMISSED",
        dismissalReason: "User dismissed from old review UI",
        matchScore: 75,
        confidenceScore: 70,
        pursuitScore: 80,
        lane: DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!,
        title: "Udbud.co software tender archive",
        description: "Browse archived public tenders.",
        url: "https://udbud.co/archive/software",
        reasons: [],
        signals: [],
      },
    ]);

    const result = await dismissInvalidNewLaneCandidates("owner-1");

    expect(result).toMatchObject({ dismissed: 0, duplicated: 0, normalizedRejected: 1 });
    expect(mocks.db.discoveryCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: "dismissed-archive", ownerId: "owner-1", status: "DISMISSED" },
      data: {
        dismissalReason: "Auto-dismissed by lane guard: archived tender URL",
        matchScore: 0,
        confidenceScore: 0,
        pursuitScore: 0,
        reasons: { push: "Rejected by lane guard: archived tender URL" },
        signals: { push: "rejected:archived tender URL" },
      },
    });
  });

  it("leaves valid manually dismissed tender rows untouched", async () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const deadline = new Date(Date.now() + 14 * 86400000).toISOString();
    mocks.db.discoveryCandidate.findMany.mockResolvedValue([
      {
        id: "manual-dismissed-valid",
        status: "DISMISSED",
        dismissalReason: "Not worth pursuing",
        matchScore: 0,
        confidenceScore: 0,
        pursuitScore: 0,
        lane,
        title: "Levering af softwareplatform",
        description: "Aktivt udbud om softwareudvikling, drift og support.",
        rawContent: "Ordregiver: Aarhus Kommune. CPV: 72200000. Softwareudvikling. Tilbudsfrist 30-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=11111111-1111-4111-8111-111111111111",
        organization: "Aarhus Kommune",
        deadline,
        applicationRoute: "APPLICATION",
        reasons: [],
        signals: [],
      },
    ]);

    const result = await dismissInvalidNewLaneCandidates("owner-1");

    expect(result).toMatchObject({ dismissed: 0, duplicated: 0, normalizedRejected: 0 });
    expect(mocks.db.discoveryCandidate.updateMany).not.toHaveBeenCalled();
  });
});
