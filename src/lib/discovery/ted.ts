import { safeFetch } from "@/lib/ingestion/net";

// TED (Tenders Electronic Daily) carries the eForms value of EU notices that the
// udbud.dk index sometimes leaves without an estimate. Search is public and
// accepts several publication numbers in one request.

const TED_SEARCH = "https://api.ted.europa.eu/v3/notices/search";
const MAX_INT = 2_147_483_647;

/** "00767356-2026" (udbud.dk) → "767356-2026" (TED). */
export function tedPublicationNumber(value?: string | null): string | null {
  const match = value?.trim().match(/^0*(\d{1,8})-(20\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

type TedNotice = Record<string, unknown> & { "publication-number"?: string };

const numbers = (value: unknown) =>
  (Array.isArray(value) ? value : value == null ? [] : [value]).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value) as string | undefined;

/** The notice's total estimate: the overall value, else the sum of its lots. */
export function tedNoticeValue(notice: TedNotice): { value: number; currency: string } | null {
  const global = numbers(notice["estimated-value-glo"]);
  const lots = numbers(notice["estimated-value-lot"]);
  const value = global[0] ?? (lots.length ? lots.reduce((a, b) => a + b, 0) : undefined);
  if (!value || value > MAX_INT) return null;
  const currency = first(notice["estimated-value-cur-glo"]) ?? first(notice["estimated-value-cur-lot"]) ?? "EUR";
  return { value: Math.round(value), currency: String(currency).toUpperCase() };
}

export async function tedEstimatedValues(publicationNumbers: string[], timeoutMs = 10_000) {
  const ids = [...new Set(publicationNumbers.map(tedPublicationNumber).filter((id): id is string => Boolean(id)))].slice(0, 50);
  const values = new Map<string, { value: number; currency: string }>();
  if (!ids.length) return values;
  const res = await safeFetch(TED_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: `publication-number IN (${ids.join(" ")})`,
      fields: ["publication-number", "estimated-value-glo", "estimated-value-cur-glo", "estimated-value-lot", "estimated-value-cur-lot"],
      limit: ids.length,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`TED search failed (${res.status})`);
  const data = JSON.parse(res.text) as { notices?: TedNotice[] };
  for (const notice of data.notices ?? []) {
    const id = tedPublicationNumber(notice["publication-number"]);
    const value = tedNoticeValue(notice);
    if (id && value) values.set(id, value);
  }
  return values;
}
