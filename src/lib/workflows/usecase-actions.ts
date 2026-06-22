import type { WorkflowRunOptions } from "./types";

function stamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function operatingDayPresetPayload(options: WorkflowRunOptions, now = new Date()) {
  return {
    name: `Operating day mode ${stamp(now)}`,
    description: "Saved operating day configuration from Workflow Command.",
    playbook: "operating-day",
    workspace: "DK",
    pinned: true,
    scheduleEnabled: false,
    scheduleIntervalHours: 24,
    scheduleNextRunAt: null,
    options: options ?? {},
  };
}
