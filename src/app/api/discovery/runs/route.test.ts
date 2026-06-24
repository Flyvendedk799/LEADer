import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerId: vi.fn(),
  createDiscoveryMission: vi.fn(),
  dismissInvalidNewLaneCandidates: vi.fn(),
  discoveryMissionDisplayWarnings: vi.fn(),
  discoveryMissionProviderLabel: vi.fn(),
  filterReviewableDiscoveryCandidates: vi.fn(),
  hiddenDiscoveryCandidatesWarning: vi.fn(),
  filterLaneCandidates: vi.fn(),
  db: {
    discoveryMission: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  discoveryQueueSnapshot: vi.fn(),
  enqueueDiscoveryMission: vi.fn(),
  isActiveDiscoveryMission: vi.fn(),
  recoverDiscoveryQueue: vi.fn(),
  removeQueuedDiscoveryMission: vi.fn(),
  reorderQueuedDiscoveryMission: vi.fn(),
  visibleDiscoveryQueueSnapshotForOwner: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwnerId: mocks.requireOwnerId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/crm", () => ({ createDiscoveryMission: mocks.createDiscoveryMission }));
vi.mock("@/lib/crm/discovery-display", () => ({
  discoveryMissionDisplayWarnings: mocks.discoveryMissionDisplayWarnings,
  discoveryMissionProviderLabel: mocks.discoveryMissionProviderLabel,
  filterReviewableDiscoveryCandidates: mocks.filterReviewableDiscoveryCandidates,
  hiddenDiscoveryCandidatesWarning: mocks.hiddenDiscoveryCandidatesWarning,
}));
vi.mock("@/lib/crm/lane-hygiene", () => ({
  dismissInvalidNewLaneCandidates: mocks.dismissInvalidNewLaneCandidates,
}));
vi.mock("@/lib/crm/lanes", () => ({ filterLaneCandidates: mocks.filterLaneCandidates }));
vi.mock("@/lib/crm/discovery-queue", () => ({
  discoveryQueueSnapshot: mocks.discoveryQueueSnapshot,
  enqueueDiscoveryMission: mocks.enqueueDiscoveryMission,
  isActiveDiscoveryMission: mocks.isActiveDiscoveryMission,
  recoverDiscoveryQueue: mocks.recoverDiscoveryQueue,
  removeQueuedDiscoveryMission: mocks.removeQueuedDiscoveryMission,
  reorderQueuedDiscoveryMission: mocks.reorderQueuedDiscoveryMission,
  visibleDiscoveryQueueSnapshotForOwner: mocks.visibleDiscoveryQueueSnapshotForOwner,
}));

import { GET, PATCH, POST } from "./route";

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/discovery/runs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/discovery/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(query = "") {
  return new Request(`http://localhost/api/discovery/runs${query}`);
}

describe("discovery run API controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerId.mockResolvedValue("owner-1");
    mocks.recoverDiscoveryQueue.mockResolvedValue({ activeMissionId: null, queuedMissionIds: [] });
    mocks.dismissInvalidNewLaneCandidates.mockResolvedValue(undefined);
    mocks.discoveryMissionDisplayWarnings.mockImplementation((_mission, warnings) => warnings);
    mocks.discoveryMissionProviderLabel.mockImplementation((mission) => mission.provider ?? "auto");
    mocks.filterReviewableDiscoveryCandidates.mockImplementation((_lane, candidates) => ({
      candidates,
      removed: 0,
      reasons: [],
    }));
    mocks.hiddenDiscoveryCandidatesWarning.mockReturnValue(null);
  });

  it("loads expanded discovery history when requested", async () => {
    mocks.db.discoveryMission.findMany.mockResolvedValue([
      {
        id: "mission-1",
        provider: "auto",
        lane: { id: "lane-1", name: "Tenders" },
        candidates: [],
        warnings: [],
        _count: { candidates: 0 },
      },
    ]);

    const response = await GET(getRequest("?limit=80"));

    expect(response.status).toBe(200);
    expect(mocks.db.discoveryMission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1" },
        take: 80,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      missions: [
        expect.objectContaining({
          id: "mission-1",
          provider: "auto",
          hiddenCandidateCount: 0,
          _count: { candidates: 0 },
        }),
      ],
      queue: { activeMissionId: null, queuedMissionIds: [] },
    });
  });

  it("caps expanded discovery history requests", async () => {
    mocks.db.discoveryMission.findMany.mockResolvedValue([]);

    await GET(getRequest("?limit=500"));

    expect(mocks.db.discoveryMission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      }),
    );
  });

  it("searches expanded discovery history server-side within the selected lane scope", async () => {
    mocks.db.discoveryMission.findMany.mockResolvedValue([
      {
        id: "mission-match",
        status: "SUCCESS",
        workspace: "DK",
        provider: "udbud.dk",
        query: "software udbud",
        lane: { id: "lane-tender", name: "Tenders", slug: "tenders-procurement" },
        candidates: [],
        warnings: [],
        log: ["Official udbud.dk returned active notices"],
        _count: { candidates: 1 },
      },
      {
        id: "mission-other",
        status: "SUCCESS",
        workspace: "DK",
        provider: "brave",
        query: "linkedin jobs",
        lane: { id: "lane-tender", name: "Tenders", slug: "tenders-procurement" },
        candidates: [],
        warnings: [],
        log: [],
        _count: { candidates: 2 },
      },
    ]);

    const response = await GET(getRequest("?q=software%20udbud&scope=current-lane&laneId=lane-tender&limit=20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.db.discoveryMission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1", laneId: "lane-tender" },
        take: 100,
      }),
    );
    expect(body.missions).toEqual([
      expect.objectContaining({
        id: "mission-match",
        provider: "udbud.dk",
      }),
    ]);
  });

  it("can find older discovery history by candidate text, not only mission query", async () => {
    mocks.db.discoveryMission.findMany.mockResolvedValue([
      {
        id: "mission-candidate-hit",
        status: "SUCCESS",
        workspace: "DK",
        provider: "auto",
        query: "generic search",
        lane: { id: "lane-1", name: "Startup", slug: "direct-startup-mvp" },
        candidates: [
          {
            title: "Aarhus Kommune udbud",
            description: "Active tender notice",
            rawContent: "",
            url: "https://udbud.dk/detaljevisning/example",
            organization: "Aarhus Kommune",
            sourceName: "udbud.dk",
            sourceKind: "web",
            category: "tender",
            status: "NEW",
            applicationRoute: "APPLICATION",
          },
        ],
        warnings: [],
        log: [],
        _count: { candidates: 1 },
      },
    ]);

    const response = await GET(getRequest("?q=Aarhus%20Kommune&scope=all&limit=20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.db.discoveryMission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1" },
        take: 100,
      }),
    );
    expect(body.missions).toEqual([
      expect.objectContaining({
        id: "mission-candidate-hit",
      }),
    ]);
  });

  it("does not match discovery history search on rejected candidate text", async () => {
    mocks.filterReviewableDiscoveryCandidates.mockImplementation((_lane, candidates) => ({
      candidates: candidates.filter((candidate: { status?: string }) => candidate.status !== "DISMISSED"),
      removed: candidates.filter((candidate: { status?: string }) => candidate.status === "DISMISSED").length,
      reasons: ["1 social/profile result, not a tender notice"],
    }));
    mocks.hiddenDiscoveryCandidatesWarning.mockReturnValue("1 rejected result was kept out of review.");
    mocks.db.discoveryMission.findMany.mockResolvedValue([
      {
        id: "mission-rejected-only",
        status: "SUCCESS",
        workspace: "DK",
        provider: "brave",
        query: "software udbud",
        lane: { id: "lane-tender", name: "Tenders", slug: "tenders-procurement" },
        candidates: [
          {
            title: "Dennis på LinkedIn: Jeg har fundet et software udbud",
            description: "LinkedIn activity about startup jobs and software.",
            rawContent: "",
            url: "https://dk.linkedin.com/posts/dennis-software-udbud",
            organization: "LinkedIn",
            sourceName: "LinkedIn",
            sourceKind: "web-search",
            category: "social",
            status: "DISMISSED",
            applicationRoute: "APPLICATION",
          },
        ],
        warnings: [],
        log: [],
        _count: { candidates: 1 },
      },
    ]);

    const response = await GET(getRequest("?q=Dennis%20LinkedIn&scope=all&limit=20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.missions).toEqual([]);
  });

  it("preserves expanded discovery history after canceling live missions", async () => {
    mocks.db.discoveryMission.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.visibleDiscoveryQueueSnapshotForOwner.mockResolvedValue({ activeMissionId: null, queuedMissionIds: [] });

    const response = await PATCH(patchRequest({ action: "CANCEL_ALL", limit: 80 }));

    expect(response.status).toBe(200);
    expect(mocks.db.discoveryMission.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { ownerId: "owner-1" },
        take: 80,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      missions: [],
      queue: { activeMissionId: null, queuedMissionIds: [] },
      canceled: 0,
    });
  });

  it("blocks rerunning a live discovery mission", async () => {
    mocks.db.discoveryMission.findFirst.mockResolvedValue({
      id: "mission-1",
      ownerId: "owner-1",
      laneId: "lane-1",
      query: "software udbud",
      workspace: "DK",
      status: "RUNNING",
      provider: "none",
      input: {
        laneId: "lane-1",
        query: "software udbud",
        workspace: "DK",
        maxResults: 5,
        includeWeb: true,
        includeSources: false,
        provider: "none",
      },
    });

    const response = await PATCH(patchRequest({ id: "mission-1", action: "RERUN" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Wait for this discovery mission to finish before rerunning it.",
    });
    expect(mocks.createDiscoveryMission).not.toHaveBeenCalled();
    expect(mocks.enqueueDiscoveryMission).not.toHaveBeenCalled();
  });

  it("returns an existing active discovery mission instead of queueing a duplicate", async () => {
    mocks.db.discoveryMission.findMany.mockResolvedValue([
      {
        id: "mission-1",
        status: "RUNNING",
        finishedAt: null,
        workspace: "DK",
        input: {
          laneId: "lane-1",
          query: "software udbud",
          workspace: "DK",
          maxResults: 8,
          includeWeb: true,
          includeSources: false,
          provider: "none",
        },
      },
    ]);
    mocks.db.discoveryMission.findFirst.mockResolvedValue({
      id: "mission-1",
      status: "RUNNING",
      lane: { id: "lane-1", name: "Tenders" },
      candidates: [],
      warnings: [],
    });

    const response = await POST(postRequest({
      laneId: "lane-1",
      query: " software   udbud ",
      workspace: "DK",
      maxResults: 8,
      includeWeb: true,
      includeSources: false,
      provider: "none",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      mission: expect.objectContaining({ id: "mission-1" }),
      hiddenCandidateCount: 0,
      queued: false,
      existing: true,
      queue: { activeMissionId: null, queuedMissionIds: [] },
    });
    expect(mocks.createDiscoveryMission).not.toHaveBeenCalled();
    expect(mocks.enqueueDiscoveryMission).not.toHaveBeenCalled();
  });

  it("queues a new discovery mission when no active input matches", async () => {
    mocks.db.discoveryMission.findMany.mockResolvedValue([]);
    mocks.createDiscoveryMission.mockResolvedValue({
      id: "mission-2",
      status: "QUEUED",
      lane: { id: "lane-1", name: "Tenders" },
      candidates: [],
      warnings: [],
    });
    mocks.discoveryQueueSnapshot.mockReturnValue({ activeMissionId: null, queuedMissionIds: ["mission-2"] });
    mocks.db.discoveryMission.update.mockResolvedValue({});

    const response = await POST(postRequest({
      laneId: "lane-1",
      query: "software udbud",
      workspace: "DK",
      maxResults: 8,
      includeWeb: true,
      includeSources: false,
      provider: "none",
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      mission: expect.objectContaining({ id: "mission-2" }),
      queued: true,
      queue: { activeMissionId: null, queuedMissionIds: ["mission-2"] },
    });
    expect(mocks.createDiscoveryMission).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        laneId: "lane-1",
        query: "software udbud",
        workspace: "DK",
        maxResults: 8,
        includeWeb: true,
        includeSources: false,
        provider: "none",
      }),
      "QUEUED",
    );
    expect(mocks.enqueueDiscoveryMission).toHaveBeenCalledWith(
      "owner-1",
      "mission-2",
      expect.objectContaining({ laneId: "lane-1", query: "software udbud" }),
    );
  });
});
