import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVERY_LANES } from "./lanes";
import { invalidLaneCandidateReason } from "./lane-hygiene";

describe("lane hygiene", () => {
  it("identifies persisted candidates that no longer satisfy their lane", () => {
    const lane = DEFAULT_DISCOVERY_LANES.find((item) => item.slug === "tenders-procurement")!;
    const activeDeadline = new Date(Date.now() + 14 * 86400000).toISOString();

    expect(
      invalidLaneCandidateReason({
        lane,
        title: "udbud.dk",
        description: "Legacy udbud page with software scope and tilbudsfrist.",
        rawContent: "Softwareudvikling. Tilbudsfrist 30-06-2099.",
        url: "https://udbud.dk/Pages/Tenders/ShowTender?tenderid=61801",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toBe("legacy udbud.dk archive URL");

    expect(
      invalidLaneCandidateReason({
        lane,
        title: "Levering, drift, vedligeholdelse og support af It-driftsstyringssystem",
        description: "Aktivt udbud om IT-driftsstyringssystem.",
        rawContent: "Ordregiver: I/S Amager Ressourcecenter. CPV: 72000000. Tilbudsfrist 07-07-2099.",
        url: "https://udbud.dk/detaljevisning?noticeId=3c00bf59-28cd-47e0-9018-dff8cac2df3e&noticeVersion=01",
        organization: "I/S Amager Ressourcecenter",
        deadline: activeDeadline,
        applicationRoute: "APPLICATION",
      }),
    ).toBeNull();
  });
});
