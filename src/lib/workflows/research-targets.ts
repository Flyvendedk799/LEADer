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

export type ResearchBriefIdentity = {
  accountId?: string | null;
  personId?: string | null;
  dealId?: string | null;
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

export function contactResearchReason(stats: ContactResearchTargetStats) {
  if (stats.peopleCount === 0) {
    return stats.latestDealTitle
      ? `Open deal "${stats.latestDealTitle}" has no people attached yet.`
      : "Open account has no people attached yet.";
  }
  return `${stats.peopleCount} ${stats.peopleCount === 1 ? "person" : "people"} saved, but none has email, phone, or LinkedIn.`;
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

export function researchBriefIdentityFromInput(input: unknown): ResearchBriefIdentity {
  const root = objectValue(input);
  const options = objectValue(root?.options);
  const brief = objectValue(options?.researchBrief);
  return {
    accountId: stringValue(brief?.accountId),
    personId: stringValue(brief?.personId),
    dealId: stringValue(brief?.dealId),
    subject: stringValue(brief?.subject),
    subjectType: stringValue(brief?.subjectType),
    objective: stringValue(brief?.objective),
    workspace: stringValue(root?.workspace),
  };
}

export function researchBriefMatchesIdentity(run: ResearchBriefRunLike, identity: ResearchBriefIdentity) {
  const runIdentity = researchBriefIdentityFromInput(run.input);
  if (identity.dealId && runIdentity.dealId === identity.dealId) return true;
  if (identity.personId && runIdentity.personId === identity.personId) return true;
  if (identity.accountId && runIdentity.accountId === identity.accountId) return true;
  const subject = normalizedSubject(identity.subject);
  if (!subject || normalizedSubject(runIdentity.subject) !== subject) return false;
  if (identity.workspace && runIdentity.workspace && runIdentity.workspace !== identity.workspace) return false;
  if (identity.subjectType && runIdentity.subjectType && runIdentity.subjectType !== identity.subjectType) return false;
  if (identity.objective && runIdentity.objective && runIdentity.objective !== identity.objective) return false;
  return true;
}

export function findActiveResearchBriefRun<T extends ResearchBriefRunLike>(
  runs: T[],
  identity: ResearchBriefIdentity,
): T | null {
  if (!identity.accountId && !identity.personId && !identity.dealId && !normalizedSubject(identity.subject)) return null;
  return runs.find((run) => researchBriefMatchesIdentity(run, identity)) ?? null;
}
