import { describe, expect, it } from "vitest";

import { operatingDayPresetPayload, researchBriefRunPayload } from "./usecase-actions";

describe("workflow usecase actions", () => {
  it("builds a pinned preset payload from an operating day configuration", () => {
    expect(
      operatingDayPresetPayload(
        {
          operatingDay: { dailySweep: true, candidateHarvest: false, pipelineRescue: true },
          dailySweep: { includeSources: true, includeAlerts: false },
          pipelineRescue: { staleDays: 10, deadlineDays: 5, limit: 8 },
        },
        new Date(2026, 5, 22, 8, 5),
      ),
    ).toEqual({
      name: "Operating day mode 2026-06-22 08:05",
      description: "Saved operating day configuration from Workflow Command.",
      playbook: "operating-day",
      workspace: "DK",
      pinned: true,
      scheduleEnabled: false,
      scheduleIntervalHours: 24,
      scheduleNextRunAt: null,
      options: {
        operatingDay: { dailySweep: true, candidateHarvest: false, pipelineRescue: true },
        dailySweep: { includeSources: true, includeAlerts: false },
        pipelineRescue: { staleDays: 10, deadlineDays: 5, limit: 8 },
      },
    });
  });

  it("preserves an international workspace on saved operating day presets", () => {
    expect(
      operatingDayPresetPayload(
        { operatingDay: { dailySweep: true, candidateHarvest: true, pipelineRescue: false } },
        new Date(2026, 5, 22, 9, 30),
        "GLOBAL",
      ),
    ).toMatchObject({
      name: "Operating day mode 2026-06-22 09:30",
      playbook: "operating-day",
      workspace: "GLOBAL",
    });
  });

  it("builds a linked research brief run payload", () => {
    expect(
      researchBriefRunPayload({
        subject: " Aarhus Kommune ",
        subjectType: "company",
        objective: "map-opportunity",
        depth: "deep",
        workspace: "DK",
        accountId: "account-1",
        dealId: "deal-1",
        candidateId: "candidate-1",
      }),
    ).toEqual({
      playbook: "research-brief",
      workspace: "DK",
      options: {
        researchBrief: {
          subject: "Aarhus Kommune",
          subjectType: "company",
          objective: "map-opportunity",
          depth: "deep",
          createTasks: true,
          accountId: "account-1",
          dealId: "deal-1",
          candidateId: "candidate-1",
        },
      },
    });
  });
});
