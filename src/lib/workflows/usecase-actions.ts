import type { WorkflowRunOptions } from "./types";
import type { Workspace } from "@/lib/types";
import {
  normalizeResearchBriefOptions,
  type ResearchDepth,
  type ResearchObjective,
  type ResearchSubjectType,
} from "./research-brief";

function stamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function operatingDayPresetPayload(
  options: WorkflowRunOptions,
  now = new Date(),
  workspace: Workspace = "DK",
) {
  return {
    name: `Operating day mode ${stamp(now)}`,
    description: "Saved operating day configuration from Workflow Command.",
    playbook: "operating-day",
    workspace,
    pinned: true,
    scheduleEnabled: false,
    scheduleIntervalHours: 24,
    scheduleNextRunAt: null,
    options: options ?? {},
  };
}

export function researchBriefRunPayload({
  subject,
  subjectType,
  objective,
  depth,
  createTasks,
  workspace = "DK",
  accountId,
  personId,
  dealId,
  candidateId,
}: {
  subject: string;
  subjectType?: ResearchSubjectType;
  objective?: ResearchObjective;
  depth?: ResearchDepth;
  createTasks?: boolean;
  workspace?: "DK" | "GLOBAL";
  accountId?: string | null;
  personId?: string | null;
  dealId?: string | null;
  candidateId?: string | null;
}) {
  const normalized = normalizeResearchBriefOptions({
    subject,
    subjectType,
    objective,
    depth,
    createTasks,
    ...(accountId ? { accountId } : {}),
    ...(personId ? { personId } : {}),
    ...(dealId ? { dealId } : {}),
    ...(candidateId ? { candidateId } : {}),
  });
  return {
    playbook: "research-brief",
    workspace,
    options: {
      researchBrief: {
        subject: normalized.subject,
        subjectType: normalized.subjectType,
        objective: normalized.objective,
        depth: normalized.depth,
        createTasks: normalized.createTasks,
        ...(normalized.accountId ? { accountId: normalized.accountId } : {}),
        ...(normalized.personId ? { personId: normalized.personId } : {}),
        ...(normalized.dealId ? { dealId: normalized.dealId } : {}),
        ...(normalized.candidateId ? { candidateId: normalized.candidateId } : {}),
      },
    },
  };
}
