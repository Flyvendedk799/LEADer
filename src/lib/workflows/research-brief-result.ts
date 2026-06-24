import type { Workspace } from "@prisma/client";

import {
  buildResearchDecisionFrame,
  buildResearchRunbook,
  buildResearchWorksheet,
  normalizeResearchBriefOptions,
  researchSubjectClueSummary,
  type ResearchBriefOptions,
  type ResearchDecisionField,
  type ResearchDecisionFrame,
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

function decisionFieldArray(value: unknown): ResearchDecisionField[] {
  return objectArray<Record<string, unknown>>(value)
    .map((item) => {
      const id = stringValue(item.id);
      const label = stringValue(item.label);
      const prompt = stringValue(item.prompt);
      const evidence = stringValue(item.evidence);
      if (!id || !label || !prompt || !evidence) return null;
      return {
        id,
        label,
        prompt,
        evidence,
        sourcePrompts: Array.isArray(item.sourcePrompts)
          ? item.sourcePrompts.filter((prompt): prompt is string => typeof prompt === "string")
          : [],
      };
    })
    .filter((item): item is ResearchDecisionField => Boolean(item));
}

function decisionFrameValue(value: unknown): ResearchDecisionFrame | null {
  const record = objectValue(value);
  if (!record) return null;
  const id = stringValue(record.id) ?? "operator-decision";
  const title = stringValue(record.title) ?? "Operator decision";
  const purpose = stringValue(record.purpose) ?? "";
  const fields = decisionFieldArray(record.fields);
  if (!fields.length) return null;
  return {
    id,
    title,
    purpose,
    outcomes: Array.isArray(record.outcomes)
      ? record.outcomes.filter((item): item is string => typeof item === "string")
      : [],
    confidenceScale: Array.isArray(record.confidenceScale)
      ? record.confidenceScale.filter((item): item is string => typeof item === "string")
      : [],
    fields,
  };
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

export function researchBriefDecisionFrameFromResult(
  result: unknown,
  fallbackWorkspace: Workspace = "DK",
  input?: unknown,
): ResearchDecisionFrame | null {
  const record = objectValue(result);
  const existing = decisionFrameValue(record?.decisionFrame);
  if (existing) return existing;
  const options = researchBriefOptionsFromPayload(result, input);
  if (!options) return null;
  return buildResearchDecisionFrame(normalizeResearchBriefOptions(options), researchBriefWorkspace(result, fallbackWorkspace));
}
