import type { WorkflowRunOptions } from "./types";
import type { Workspace } from "@/lib/types";

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
  subjectType = "unknown",
  objective = "qualify-lead",
  depth = "standard",
  createTasks = true,
  workspace = "DK",
  accountId,
  personId,
  dealId,
}: {
  subject: string;
  subjectType?: "person" | "company" | "unknown";
  objective?: "find-contact" | "qualify-lead" | "map-opportunity" | "verify-identity" | "general";
  depth?: "quick" | "standard" | "deep";
  createTasks?: boolean;
  workspace?: "DK" | "GLOBAL";
  accountId?: string | null;
  personId?: string | null;
  dealId?: string | null;
}) {
  return {
    playbook: "research-brief",
    workspace,
    options: {
      researchBrief: {
        subject: subject.trim(),
        subjectType,
        objective,
        depth,
        createTasks,
        ...(accountId ? { accountId } : {}),
        ...(personId ? { personId } : {}),
        ...(dealId ? { dealId } : {}),
      },
    },
  };
}
