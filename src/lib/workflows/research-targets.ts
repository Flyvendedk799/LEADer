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

export function researchBriefIdentityFromInput(input: unknown): ResearchBriefIdentity {
  const root = objectValue(input);
  const options = objectValue(root?.options);
  const brief = objectValue(options?.researchBrief);
  return {
    accountId: stringValue(brief?.accountId),
    personId: stringValue(brief?.personId),
    dealId: stringValue(brief?.dealId),
  };
}

export function researchBriefMatchesIdentity(run: ResearchBriefRunLike, identity: ResearchBriefIdentity) {
  const runIdentity = researchBriefIdentityFromInput(run.input);
  if (identity.dealId && runIdentity.dealId === identity.dealId) return true;
  if (identity.personId && runIdentity.personId === identity.personId) return true;
  if (identity.accountId && runIdentity.accountId === identity.accountId) return true;
  return false;
}

export function findActiveResearchBriefRun<T extends ResearchBriefRunLike>(
  runs: T[],
  identity: ResearchBriefIdentity,
): T | null {
  if (!identity.accountId && !identity.personId && !identity.dealId) return null;
  return runs.find((run) => researchBriefMatchesIdentity(run, identity)) ?? null;
}
