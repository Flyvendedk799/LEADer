import type { CandidateLike, LaneLike } from "./lanes";

type DedupeCandidate = CandidateLike & { id?: string | null };

function keyText(value?: string | null, max = 180) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase().slice(0, max) || "";
}

function parsedDeadline(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tenderKey(candidate: DedupeCandidate, deadline: Date | null) {
  const title = keyText(candidate.title);
  const organization = keyText(candidate.organization);
  return title && organization && deadline
    ? `tender:${organization}:${title}:${deadline.toISOString().slice(0, 10)}`
    : null;
}

function urlKey(candidate: DedupeCandidate) {
  if (!candidate.url) return null;
  try {
    const url = new URL(candidate.url);
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return candidate.url;
  }
}

/**
 * The stored dedupe key. It does not depend on the lane: a notice with a buyer,
 * title and deadline is the same lead whichever lane found it. (The lane
 * parameter is kept for call-site compatibility.)
 */
export function discoveryCandidateDedupeKey(
  _lane: Pick<LaneLike, "slug"> | null | undefined,
  candidate: DedupeCandidate,
  deadline: Date | null = parsedDeadline(candidate.deadline),
) {
  return (
    tenderKey(candidate, deadline) ??
    urlKey(candidate) ??
    `text:${keyText(candidate.organization)}:${keyText(candidate.title, 250)}`
  );
}

/** Every key a candidate may have been stored under, for matching older rows. */
export function discoveryCandidateDedupeKeys(
  candidate: DedupeCandidate,
  deadline: Date | null = parsedDeadline(candidate.deadline),
) {
  return [tenderKey(candidate, deadline), urlKey(candidate)].filter((key): key is string => Boolean(key));
}

export const DUPLICATE_CANDIDATE_REASON =
  "Duplicate active candidate: another review item has the same tender buyer, title, and deadline.";
