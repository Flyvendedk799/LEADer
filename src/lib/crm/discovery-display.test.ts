import { describe, expect, it } from "vitest";

import {
  discoveryMissionDisplayWarnings,
  discoveryMissionProviderLabel,
  filterReviewableDiscoveryCandidates,
  hiddenDiscoveryCandidatesWarning,
  splitReviewableDiscoveryCandidates,
} from "./discovery-display";
import { DEFAULT_DISCOVERY_LANES } from "./lanes";

describe("discovery display helpers", () => {
  it("labels focused official tender missions as udbud.dk instead of none", () => {
    expect(
      discoveryMissionProviderLabel({
        provider: "none",
        lane: { slug: "tenders-procurement" },
        log: ["2026-06-22T22:16:14.112Z udbud.dk returned 4 active tender candidates in 33s."],
      }),
    ).toBe("udbud.dk");
  });

  it("keeps explicit generic search providers", () => {
    expect(
      discoveryMissionProviderLabel({
        provider: "brave",
        lane: { slug: "tenders-procurement" },
        log: ["2026-06-22T22:16:14.112Z udbud.dk returned 4 active tender candidates in 33s."],
      }),
    ).toBe("brave");
  });

  it("hides generic search-key warnings for official-only tender missions", () => {
    expect(
      discoveryMissionDisplayWarnings(
        {
          provider: "none",
          lane: { slug: "tenders-procurement" },
          log: ["2026-06-22T22:16:14.112Z udbud.dk returned 4 active tender candidates in 33s."],
        },
        [
          "No web search API key configured. Add Tavily, Brave Search, or Serper in Settings -> AI to enable broad web discovery.",
          "2 stale or off-lane candidates hidden from this mission: 2 broad framework agreement.",
        ],
      ),
    ).toEqual(["2 stale or off-lane candidates hidden from this mission: 2 broad framework agreement."]);
  });

  it("hides dismissed, duplicate, and off-lane rows from mission review output", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const activeDeadline = new Date(Date.now() + 30 * 86400000).toISOString();

    const result = filterReviewableDiscoveryCandidates(lane, [
      {
        title: "Intranet",
        description: "Aktivt udbud om softwareudvikling, drift og support. Tilbudsfrist 30-07-2099.",
        rawContent: "Ordregiver: Metroselskabet. CPV: 72000000. Tilbudsfrist 30-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=4ccaf6e0-67d2-4f9e-8482-e6563f2b16d9",
        organization: "Metroselskabet",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
        status: "NEW",
      },
      {
        title: "Archived tender",
        description: "Software tender archive entry.",
        url: "https://udbud.co/archive",
        status: "NEW",
      },
      {
        title: "Dismissed but otherwise valid",
        description: "Aktivt udbud om softwareudvikling. Tilbudsfrist 30-07-2099.",
        rawContent: "Ordregiver: Kommune. CPV: 72000000. Softwareudvikling. Tilbudsfrist 30-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=11111111-1111-4111-8111-111111111111",
        organization: "Kommune",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
        status: "DISMISSED",
      },
      {
        title: "Duplicate but otherwise valid",
        description: "Aktivt udbud om softwareudvikling. Tilbudsfrist 30-07-2099.",
        rawContent: "Ordregiver: Region. CPV: 72000000. Softwareudvikling. Tilbudsfrist 30-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=22222222-2222-4222-8222-222222222222",
        organization: "Region",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
        status: "DUPLICATE",
      },
    ]);

    expect(result.candidates.map((candidate) => candidate.title)).toEqual(["Intranet"]);
    expect(result.removed).toBe(3);
    expect(hiddenDiscoveryCandidatesWarning(result.removed, result.reasons)).toContain(
      "3 dismissed, duplicate, stale or off-lane candidates hidden",
    );
  });

  it("keeps hidden discovery rows inspectable with concrete reasons", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const activeDeadline = new Date(Date.now() + 30 * 86400000).toISOString();

    const result = splitReviewableDiscoveryCandidates(lane, [
      {
        title: "Active software tender",
        description: "Aktivt udbud om softwareudvikling. Tilbudsfrist 30-07-2099.",
        rawContent: "Ordregiver: Kommune. CPV: 72000000. Softwareudvikling. Tilbudsfrist 30-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=11111111-1111-4111-8111-111111111111",
        organization: "Kommune",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
        status: "NEW",
      },
      {
        title: "Udbud.co archive",
        description: "Browse archived software tenders.",
        url: "https://udbud.co/archive/software",
        status: "NEW",
      },
      {
        title: "Duplicate active software tender",
        description: "Aktivt udbud om softwareudvikling. Tilbudsfrist 30-07-2099.",
        rawContent: "Ordregiver: Region. CPV: 72000000. Softwareudvikling. Tilbudsfrist 30-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=22222222-2222-4222-8222-222222222222",
        organization: "Region",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
        status: "DUPLICATE",
      },
    ]);

    expect(result.candidates.map((candidate) => candidate.title)).toEqual(["Active software tender"]);
    expect(result.hidden.map((candidate) => [candidate.title, candidate.hiddenReason])).toEqual([
      ["Udbud.co archive", "archived tender URL"],
      ["Duplicate active software tender", "duplicate candidate"],
    ]);
    expect(result.reasons).toEqual(["1 archived tender URL", "1 dismissed or duplicate candidate"]);
  });
});
