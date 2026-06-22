const HOUR_MS = 60 * 60 * 1000;

export type WorkflowPresetScheduleControlAction =
  | "PAUSE"
  | "RESUME"
  | "SNOOZE_1H"
  | "SNOOZE_24H"
  | "SKIP_ONCE";

type ScheduleControlPreset = {
  scheduleIntervalHours: number;
  scheduleNextRunAt?: string | Date | null;
};

type ScheduleControlPayload = {
  scheduleEnabled: boolean;
  scheduleNextRunAt?: string | null;
};

function clampedIntervalHours(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(720, Math.round(value))) : 24;
}

function isoFrom(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inHours(now: Date, hours: number) {
  return new Date(now.getTime() + clampedIntervalHours(hours) * HOUR_MS).toISOString();
}

export function workflowPresetScheduleControlPayload(
  preset: ScheduleControlPreset,
  action: WorkflowPresetScheduleControlAction,
  now = new Date(),
): ScheduleControlPayload {
  if (action === "PAUSE") return { scheduleEnabled: false };
  if (action === "RESUME") {
    return { scheduleEnabled: true, scheduleNextRunAt: isoFrom(preset.scheduleNextRunAt) };
  }
  if (action === "SNOOZE_1H") return { scheduleEnabled: true, scheduleNextRunAt: inHours(now, 1) };
  if (action === "SNOOZE_24H") return { scheduleEnabled: true, scheduleNextRunAt: inHours(now, 24) };
  return { scheduleEnabled: true, scheduleNextRunAt: inHours(now, preset.scheduleIntervalHours) };
}

export function workflowPresetScheduleControlLabel(action: WorkflowPresetScheduleControlAction) {
  if (action === "PAUSE") return "Pause schedule";
  if (action === "RESUME") return "Resume schedule";
  if (action === "SNOOZE_1H") return "Snooze 1 hour";
  if (action === "SNOOZE_24H") return "Snooze 24 hours";
  return "Skip one interval";
}
