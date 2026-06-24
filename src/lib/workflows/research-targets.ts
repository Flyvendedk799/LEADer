import {
  normalizeResearchBriefOptions,
  type ResearchObjective,
  type ResearchSubjectType,
} from "./research-brief";

type ContactRoute = {
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
};

export type ContactResearchTargetStats = {
  peopleCount: number;
  reachablePeopleCount: number;
  openDealCount: number;
  latestDealTitle?: string | null;
};

export type PersonContactResearchTargetStats = {
  personName?: string | null;
  personRole?: string | null;
  accountName?: string | null;
  latestDealTitle?: string | null;
};

export type ResearchBriefIdentity = {
  accountId?: string | null;
  personId?: string | null;
  dealId?: string | null;
  candidateId?: string | null;
  subject?: string | null;
  subjectType?: string | null;
  objective?: string | null;
  workspace?: string | null;
};

export type ResearchBriefRunLike = {
  id: string;
  status: string;
  input?: unknown;
};

export type CandidateResearchBriefDefaults = {
  subject: string;
  subjectType: "company" | "unknown";
  objective: "find-contact" | "map-opportunity";
  depth: "standard" | "deep";
  actionLabel: string;
};

function hasValue(value?: string | null) {
  return Boolean(value?.trim());
}

export function personHasContactRoute(person: ContactRoute) {
  return hasValue(person.email) || hasValue(person.phone) || hasValue(person.linkedin);
}

export function countReachablePeople(people: ContactRoute[] = []) {
  return people.filter(personHasContactRoute).length;
}

export function needsContactResearch({
  people,
  openDealCount,
}: {
  people: ContactRoute[];
  openDealCount: number;
}) {
  return openDealCount > 0 && countReachablePeople(people) === 0;
}

export function needsPersonContactResearch({
  person,
  openDealCount,
}: {
  person: ContactRoute & { name?: string | null };
  openDealCount: number;
}) {
  return openDealCount > 0 && hasValue(person.name) && !personHasContactRoute(person);
}

export function contactResearchReason(stats: ContactResearchTargetStats) {
  if (stats.peopleCount === 0) {
    return stats.latestDealTitle
      ? `Open deal "${stats.latestDealTitle}" has no people attached yet.`
      : "Open account has no people attached yet.";
  }
  return `${stats.peopleCount} ${stats.peopleCount === 1 ? "person" : "people"} saved, but none has email, phone, or LinkedIn.`;
}

export function personContactResearchReason(stats: PersonContactResearchTargetStats) {
  const person = stats.personName?.trim() || "Saved person";
  const role = stats.personRole?.trim() ? ` (${stats.personRole.trim()})` : "";
  const account = stats.accountName?.trim() ? ` at ${stats.accountName.trim()}` : "";
  const deal = stats.latestDealTitle?.trim() ? ` for "${stats.latestDealTitle.trim()}"` : "";
  return `${person}${role}${account}${deal} has no email, phone, or LinkedIn yet.`;
}

export function personResearchSubject(input: {
  personName?: string | null;
  personRole?: string | null;
  accountName?: string | null;
}) {
  const name = input.personName?.replace(/\s+/g, " ").trim();
  const role = input.personRole?.replace(/\s+/g, " ").trim();
  const account = input.accountName?.replace(/\s+/g, " ").trim();
  return [name, role ? `(${role})` : "", account ? `at ${account}` : ""].filter(Boolean).join(" ");
}

export function candidateContactResearchSubject(input: {
  title?: string | null;
  organization?: string | null;
  sourceName?: string | null;
}) {
  const organization = input.organization?.replace(/\s+/g, " ").trim();
  if (organization) return organization.slice(0, 160);

  const title = input.title?.replace(/\s+/g, " ").trim();
  if (title) return title.slice(0, 160);

  const sourceName = input.sourceName?.replace(/\s+/g, " ").trim();
  return (sourceName || "Discovery candidate").slice(0, 160);
}

function isTenderResearchCandidate(input: {
  title?: string | null;
  description?: string | null;
  rawContent?: string | null;
  url?: string | null;
  laneName?: string | null;
  sourceName?: string | null;
  sourceKind?: string | null;
  category?: string | null;
}) {
  const text = [
    input.title,
    input.description,
    input.rawContent,
    input.url,
    input.laneName,
    input.sourceName,
    input.sourceKind,
    input.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return /tender|procurement|udbud|offentligt indkøb|offentligt indkoeb|tilbudsfrist|udbudsfrist|ordregiver|detaljevisning|mercell|eu-supply|publicpurchase/.test(
    text,
  );
}

export function candidateResearchBriefDefaults(input: {
  title?: string | null;
  description?: string | null;
  rawContent?: string | null;
  url?: string | null;
  organization?: string | null;
  laneName?: string | null;
  sourceName?: string | null;
  sourceKind?: string | null;
  category?: string | null;
}): CandidateResearchBriefDefaults {
  const tender = isTenderResearchCandidate(input);
  return {
    subject: candidateContactResearchSubject(input),
    subjectType: input.organization?.trim() ? "company" : "unknown",
    objective: tender ? "map-opportunity" : "find-contact",
    depth: tender ? "deep" : "standard",
    actionLabel: tender ? "Research opportunity" : "Research contact",
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedSubject(value?: string | null) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (email) return `email:${email.toLocaleLowerCase()}`;

  const phone = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,}\d{2,4}/)?.[0];
  const phoneDigits = normalizePhoneDigits(phone);
  if (phoneDigits && phoneDigits.length >= 7) return `phone:${phoneDigits}`;

  const url = text.match(/https?:\/\/[^\s]+/i)?.[0];
  const domain = url ? cleanSubjectDomain(url) : cleanSubjectDomain(text);
  if (domain && /\.[a-z]{2,}$/i.test(domain)) return `domain:${domain}`;

  return text.toLocaleLowerCase();
}

function cleanSubjectDomain(value: string) {
  const raw = value.trim().toLocaleLowerCase();
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0] ?? "";
  }
}

function normalizePhoneDigits(value?: string | null) {
  const digits = value?.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("0045")) return digits.slice(4);
  if (digits.length === 10 && digits.startsWith("45")) return digits.slice(2);
  return digits;
}

function sameWhenBothPresent(a?: string | null, b?: string | null) {
  return !a || !b || a === b;
}

function researchBriefModeMatches(runIdentity: ResearchBriefIdentity, identity: ResearchBriefIdentity) {
  return (
    sameWhenBothPresent(identity.workspace, runIdentity.workspace) &&
    sameWhenBothPresent(identity.subjectType, runIdentity.subjectType) &&
    sameWhenBothPresent(identity.objective, runIdentity.objective)
  );
}

export function researchBriefIdentityFromInput(input: unknown): ResearchBriefIdentity {
  const root = objectValue(input);
  const options = objectValue(root?.options);
  const brief = objectValue(options?.researchBrief);
  const normalized = normalizeResearchBriefOptions({
    subject: stringValue(brief?.subject) ?? "",
    subjectType: stringValue(brief?.subjectType) as ResearchSubjectType | undefined,
    objective: stringValue(brief?.objective) as ResearchObjective | undefined,
    accountId: stringValue(brief?.accountId) ?? undefined,
    personId: stringValue(brief?.personId) ?? undefined,
    dealId: stringValue(brief?.dealId) ?? undefined,
    candidateId: stringValue(brief?.candidateId) ?? undefined,
  });
  return {
    accountId: normalized.accountId ?? null,
    personId: normalized.personId ?? null,
    dealId: normalized.dealId ?? null,
    candidateId: normalized.candidateId ?? null,
    subject: normalized.subject || null,
    subjectType: normalized.subjectType,
    objective: normalized.objective,
    workspace: stringValue(root?.workspace),
  };
}

function normalizeResearchBriefIdentity(identity: ResearchBriefIdentity): ResearchBriefIdentity {
  const normalized = normalizeResearchBriefOptions({
    subject: identity.subject ?? "",
    subjectType: identity.subjectType as ResearchSubjectType | undefined,
    objective: identity.objective as ResearchObjective | undefined,
    accountId: identity.accountId ?? undefined,
    personId: identity.personId ?? undefined,
    dealId: identity.dealId ?? undefined,
    candidateId: identity.candidateId ?? undefined,
  });
  return {
    accountId: normalized.accountId ?? null,
    personId: normalized.personId ?? null,
    dealId: normalized.dealId ?? null,
    candidateId: normalized.candidateId ?? null,
    subject: normalized.subject || null,
    subjectType: normalized.subjectType,
    objective: normalized.objective,
    workspace: identity.workspace ?? null,
  };
}

export function researchBriefMatchesIdentity(run: ResearchBriefRunLike, identity: ResearchBriefIdentity) {
  const runIdentity = researchBriefIdentityFromInput(run.input);
  const targetIdentity = normalizeResearchBriefIdentity(identity);
  if (targetIdentity.candidateId) return runIdentity.candidateId === targetIdentity.candidateId;
  if (!researchBriefModeMatches(runIdentity, targetIdentity)) return false;
  if (targetIdentity.personId) {
    if (runIdentity.personId === targetIdentity.personId) return true;
    const subject = normalizedSubject(targetIdentity.subject);
    return Boolean(subject && normalizedSubject(runIdentity.subject) === subject);
  }
  if (targetIdentity.dealId && runIdentity.dealId === targetIdentity.dealId) return true;
  if (targetIdentity.accountId && runIdentity.accountId === targetIdentity.accountId) return true;
  const subject = normalizedSubject(targetIdentity.subject);
  if (!subject || normalizedSubject(runIdentity.subject) !== subject) return false;
  return true;
}

export function findActiveResearchBriefRun<T extends ResearchBriefRunLike>(
  runs: T[],
  identity: ResearchBriefIdentity,
): T | null {
  const targetIdentity = normalizeResearchBriefIdentity(identity);
  if (
    !targetIdentity.accountId &&
    !targetIdentity.personId &&
    !targetIdentity.dealId &&
    !targetIdentity.candidateId &&
    !normalizedSubject(targetIdentity.subject)
  ) {
    return null;
  }
  return runs.find((run) => researchBriefMatchesIdentity(run, targetIdentity)) ?? null;
}
