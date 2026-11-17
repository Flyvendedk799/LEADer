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

export function discoveryCandidateDedupeKey(
  lane: Pick<LaneLike, "slug">,
  candidate: DedupeCandidate,
  deadline: Date | null = parsedDeadline(candidate.deadline),
) {
  const title = keyText(candidate.title);
  const organization = keyText(candidate.organization);
  if (lane.slug === "tenders-procurement" && title && organization && deadline) {
    return `tender:${organization}:${title}:${deadline.toISOString().slice(0, 10)}`;
  }

  if (candidate.url) {
    try {
      const url = new URL(candidate.url);
      for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
      url.searchParams.sort();
      return url.toString().replace(/\/$/, "");
    } catch { return candidate.url; }
  }
  return `text:${keyText(candidate.organization)}:${keyText(candidate.title, 250)}`;
}

export const DUPLICATE_CANDIDATE_REASON =
  "Duplicate active candidate: another review item has the same tender buyer, title, and deadline.";
