import type { ScoreBreakdown } from "@/lib/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function confidenceScore(input: {
  hasUrl?: boolean;
  hasDeadline?: boolean;
  hasBudget?: boolean;
  hasOrganization?: boolean;
  evidenceCount?: number;
  sourceKind?: string | null;
}) {
  let score = 35;
  if (input.hasUrl) score += 15;
  if (input.hasDeadline) score += 15;
  if (input.hasBudget) score += 12;
  if (input.hasOrganization) score += 10;
  score += Math.min(15, (input.evidenceCount ?? 0) * 5);
  if (input.sourceKind === "source-scan") score += 5;
  return clamp(score);
}

export function pursuitScore(input: {
  matchScore?: number | null;
  confidenceScore?: number | null;
  deadline?: Date | string | null;
  priority?: number | null;
}) {
  const match = input.matchScore ?? 50;
  const confidence = input.confidenceScore ?? 50;
  let urgency = 45;
  if (input.deadline) {
    const diffDays = (new Date(input.deadline).getTime() - Date.now()) / 86400000;
    urgency = diffDays < 0 ? 0 : diffDays <= 7 ? 90 : diffDays <= 30 ? 75 : diffDays <= 90 ? 55 : 35;
  }
  const priority = (input.priority ?? 0) * 4;
  return clamp(match * 0.52 + confidence * 0.28 + urgency * 0.2 + priority);
}

export function candidateReasons(breakdown?: ScoreBreakdown | null, extras: string[] = []) {
  const scoreReasons =
    breakdown?.components
      ?.filter((component) => component.raw >= 0.45)
      .slice(0, 3)
      .map((component) => component.note ? `${component.label}: ${component.note}` : component.label) ?? [];
  return [...extras, ...scoreReasons].filter(Boolean).slice(0, 5);
}
