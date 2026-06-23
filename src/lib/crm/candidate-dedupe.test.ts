import { describe, expect, it } from "vitest";

import { discoveryCandidateDedupeKey } from "./candidate-dedupe";
import { DEFAULT_DISCOVERY_LANES } from "./lanes";

describe("discovery candidate dedupe keys", () => {
  it("dedupes republished official tender notices by buyer, title, and deadline", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const deadline = new Date("2026-06-29T06:00:00.000Z");

    const first = discoveryCandidateDedupeKey(lane, {
      title: "Intranet",
      organization: "METROSELSKABET I/S",
      deadline,
      url: "https://udbud.dk/detaljevisning?noticeId=2de56b9a-b277-4787-9266-531686ad9731&noticeVersion=01",
    });
    const republished = discoveryCandidateDedupeKey(lane, {
      title: "Intranet",
      organization: "METROSELSKABET I/S",
      deadline,
      url: "https://udbud.dk/detaljevisning?noticeId=4ccaf6e0-67d2-4f9e-8482-e6563f2b16d9&noticeVersion=01",
    });

    expect(republished).toBe(first);
  });

  it("keeps non-tender URL dedupe behavior stable", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "direct-startup-mvp")!;

    expect(
      discoveryCandidateDedupeKey(lane, {
        title: "Founder needs MVP",
        sourceName: "Example",
        url: "https://example.com/opportunity",
      }),
    ).toBe("https://example.com/opportunity");
  });
});
