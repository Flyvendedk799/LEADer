import type { Prisma } from "@prisma/client";
import { z } from "zod";

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

export const workflowPresetBulkScheduleActionSchema = z.object({
  action: z.enum(["PAUSE_ALL", "RESUME_PINNED", "SNOOZE_ALL_1H", "SNOOZE_ALL_24H"]),
});

export type WorkflowPresetBulkScheduleAction = z.infer<typeof workflowPresetBulkScheduleActionSchema>["action"];

export type WorkflowPresetBulkSchedulePreset = {
  id: string;
  pinned: boolean;
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  scheduleNextRunAt: Date | null;
};

export function workflowPresetBulkScheduleWhere(
  ownerId: string,
  action: WorkflowPresetBulkScheduleAction,
): Prisma.WorkflowPresetWhereInput {
  if (action === "RESUME_PINNED") return { ownerId, pinned: true };
  return { ownerId, scheduleEnabled: true };
}

export function workflowPresetBulkSchedulePayload(
  preset: WorkflowPresetBulkSchedulePreset,
  action: WorkflowPresetBulkScheduleAction,
  now = new Date(),
) {
  if (action === "PAUSE_ALL") return workflowPresetScheduleControlPayload(preset, "PAUSE", now);
  if (action === "RESUME_PINNED") return workflowPresetScheduleControlPayload(preset, "RESUME", now);
  if (action === "SNOOZE_ALL_1H") return workflowPresetScheduleControlPayload(preset, "SNOOZE_1H", now);
  return workflowPresetScheduleControlPayload(preset, "SNOOZE_24H", now);
}

export function workflowPresetBulkScheduleLabel(action: WorkflowPresetBulkScheduleAction) {
  if (action === "PAUSE_ALL") return "Pause all schedules";
  if (action === "RESUME_PINNED") return "Resume pinned schedules";
  if (action === "SNOOZE_ALL_1H") return "Snooze all 1 hour";
  return "Snooze all 24 hours";
}

export function workflowPresetBulkScheduleReason(action: WorkflowPresetBulkScheduleAction) {
  return action.toLowerCase();
}

export function workflowPresetBulkScheduleMessage(action: WorkflowPresetBulkScheduleAction) {
  if (action === "PAUSE_ALL") return "Paused by bulk schedule control.";
  if (action === "RESUME_PINNED") return "Resumed by bulk schedule control.";
  if (action === "SNOOZE_ALL_1H") return "Snoozed 1 hour by bulk schedule control.";
  return "Snoozed 24 hours by bulk schedule control.";
}
