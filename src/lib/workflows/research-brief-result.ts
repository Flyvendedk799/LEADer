import type { Workspace } from "@prisma/client";

import {
  buildResearchRunbook,
  buildResearchWorksheet,
  normalizeResearchBriefOptions,
  researchSubjectClueSummary,
  type ResearchBriefOptions,
  type ResearchSubjectClueSummary,
  type ResearchRunbookStep,
  type ResearchWorksheetSection,
} from "./research-brief";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectArray<T>(value: unknown) {
  return Array.isArray(value) ? (value.filter((item) => objectValue(item)) as T[]) : [];
}

function clueSummaryArray(value: unknown): ResearchSubjectClueSummary[] {
  const allowed = new Set<ResearchSubjectClueSummary["id"]>(["email", "phone", "domain", "name-hint"]);
  return objectArray<Record<string, unknown>>(value)
    .map((item) => {
      const id = stringValue(item.id);
      const label = stringValue(item.label);
      const clueValue = stringValue(item.value);
      if (!id || !allowed.has(id as ResearchSubjectClueSummary["id"]) || !label || !clueValue) return null;
      return { id: id as ResearchSubjectClueSummary["id"], label, value: clueValue };
    })
    .filter((item): item is ResearchSubjectClueSummary => Boolean(item));
}

function workspaceValue(value: unknown, fallback: Workspace = "DK"): Workspace {
  return value === "GLOBAL" || value === "DK" ? value : fallback;
}

function researchBriefInputOptions(input: unknown) {
  const record = objectValue(input);
  const options = objectValue(record?.options);
  return objectValue(options?.researchBrief);
}

function researchBriefOptionsFromPayload(result: unknown, input?: unknown): ResearchBriefOptions | null {
  const record = objectValue(result);
  const inputOptions = researchBriefInputOptions(input);
  const subject = stringValue(record?.subject) ?? stringValue(inputOptions?.subject);
  if (!subject) return null;

  return {
    subject,
    subjectType: stringValue(record?.subjectType) ?? stringValue(inputOptions?.subjectType),
    objective: stringValue(record?.objective) ?? stringValue(inputOptions?.objective),
    depth: stringValue(record?.depth) ?? stringValue(inputOptions?.depth),
    accountId: stringValue(record?.accountId) ?? stringValue(inputOptions?.accountId),
    personId: stringValue(record?.personId) ?? stringValue(inputOptions?.personId),
    dealId: stringValue(record?.dealId) ?? stringValue(inputOptions?.dealId),
    createTasks:
      typeof record?.createTasks === "boolean"
        ? record.createTasks
        : typeof inputOptions?.createTasks === "boolean"
          ? inputOptions.createTasks
          : undefined,
  } as ResearchBriefOptions;
}

function researchBriefWorkspace(result: unknown, fallback: Workspace = "DK") {
  const record = objectValue(result);
  return workspaceValue(record?.workspace, fallback);
}

export function researchBriefRunbookFromResult(
  result: unknown,
  fallbackWorkspace: Workspace = "DK",
  input?: unknown,
): ResearchRunbookStep[] {
  const record = objectValue(result);
  const existing = objectArray<ResearchRunbookStep>(record?.runbook);
  if (existing.length) return existing;
  const options = researchBriefOptionsFromPayload(result, input);
  if (!options) return [];
  return buildResearchRunbook(normalizeResearchBriefOptions(options), researchBriefWorkspace(result, fallbackWorkspace));
}

export function researchBriefWorksheetFromResult(
  result: unknown,
  fallbackWorkspace: Workspace = "DK",
  input?: unknown,
): ResearchWorksheetSection[] {
  const record = objectValue(result);
  const existing = objectArray<ResearchWorksheetSection>(record?.worksheet);
  if (existing.length) return existing;
  const options = researchBriefOptionsFromPayload(result, input);
  if (!options) return [];
  return buildResearchWorksheet(normalizeResearchBriefOptions(options), researchBriefWorkspace(result, fallbackWorkspace));
}

export function researchBriefClueSummaryFromResult(
  result: unknown,
  input?: unknown,
): ResearchSubjectClueSummary[] {
  const record = objectValue(result);
  const existing = clueSummaryArray(record?.clueSummary);
  if (existing.length) return existing;
  const options = researchBriefOptionsFromPayload(result, input);
  if (!options) return [];
  return researchSubjectClueSummary(normalizeResearchBriefOptions(options).subject);
}
