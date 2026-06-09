// Lightweight, deterministic heuristics to enrich candidates without an LLM.
// (The AI extract action gives richer results when a key is configured.)

const MONTHS_DA: Record<string, number> = {
  januar: 0, februar: 1, marts: 2, april: 3, maj: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
};

/**
 * Build an end-of-day local Date, returning null for impossible dates
 * (e.g. 31/02) instead of letting JS overflow Feb 31 into March 3.
 */
function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1) return null;
  const maxDay = new Date(year, month + 1, 0).getDate();
  if (day > maxDay) return null;
  return new Date(year, month, day, 23, 59);
}

/** Pull a budget range (DKK) from free text. Returns {min,max} in whole DKK. */
export function extractBudget(text: string): { min?: number; max?: number; currency?: string } {
  if (!text) return {};
  const t = text.toLowerCase();
  const currency = /eur|€/.test(t) ? "EUR" : /usd|\$/.test(t) ? "USD" : "DKK";

  // Normalise numbers like "100.000", "100,000", "100k", "kr. 75.000".
  const num = (raw: string): number => {
    let s = raw.toLowerCase().replace(/\s/g, "");
    const k = /k$/.test(s);
    s = s.replace(/k$/, "").replace(/\.(?=\d{3}\b)/g, "").replace(/,/g, "");
    let n = parseInt(s, 10);
    if (Number.isNaN(n)) return NaN;
    if (k) n *= 1000;
    return n;
  };

  // Range: "50.000 - 100.000". The (?![a-zæøå]) stops "kr"/"kroner" being read
  // as a thousands "k" suffix (only a standalone "k", e.g. "100k", multiplies).
  const KNUM = "(\\d[\\d.,]*(?:\\s?k(?![a-zæøå]))?)";
  const range = t.match(new RegExp(`${KNUM}\\s?(?:-|–|til|to)\\s?${KNUM}`));
  if (range) {
    const min = num(range[1]);
    const max = num(range[2]);
    if (!Number.isNaN(min) && !Number.isNaN(max)) return { min, max, currency };
  }

  // Single amount near a money cue.
  const single = t.match(new RegExp(`(?:kr\\.?|dkk|budget|tilskud|op til|maks\\.?|max)[^\\d]{0,12}${KNUM}`));
  if (single) {
    const v = num(single[1]);
    if (!Number.isNaN(v) && v >= 1000) return { max: v, currency };
  }
  return { currency };
}

/** Pull a deadline date from free text (Danish + ISO). */
export function extractDeadline(text: string): Date | null {
  if (!text) return null;
  const t = text.toLowerCase();

  // ISO yyyy-mm-dd
  const iso = t.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T23:59:59`);

  // dd/mm/yyyy or dd.mm.yyyy
  const dmy = t.match(/(\d{1,2})[./](\d{1,2})[./](20\d{2})/);
  if (dmy) return makeDate(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  // "15. marts 2026" / "15 marts"
  const da = t.match(/(\d{1,2})\.?\s+([a-zæøå]+)\s*(20\d{2})?/);
  if (da && MONTHS_DA[da[2]] != null) {
    const year = da[3] ? Number(da[3]) : new Date().getFullYear();
    return makeDate(year, MONTHS_DA[da[2]], Number(da[1]));
  }
  return null;
}

export function detectApplicationRoute(text: string): "DIRECT" | "APPLICATION" | "UNKNOWN" {
  const t = (text || "").toLowerCase();
  if (/ansøg|ansøgning|application|apply|udfyld|formular|deadline for/.test(t)) return "APPLICATION";
  if (/kontakt|contact|skriv til|ring|email|e-mail|@/.test(t)) return "DIRECT";
  return "UNKNOWN";
}
