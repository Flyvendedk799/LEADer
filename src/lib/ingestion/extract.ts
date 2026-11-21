import { copenhagenDate } from "@/lib/dates";
// Lightweight, deterministic heuristics to enrich candidates without an LLM.
// (The AI extract action gives richer results when a key is configured.)

const MONTHS_DA: Record<string, number> = {
  januar: 0,
  februar: 1,
  marts: 2,
  april: 3,
  maj: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  okt: 9,
  nov: 10,
  dec: 11,
};

/**
 * Build a Copenhagen deadline, returning null for impossible dates
 * (e.g. 31/02) instead of letting JS overflow Feb 31 into March 3.
 */
function makeDate(
  year: number,
  month: number,
  day: number,
  hour = 23,
  minute = 59,
): Date | null {
  if (month < 0 || month > 11 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day > maxDay) return null;
  return copenhagenDate(year, month + 1, day, hour, minute);
}

/** Pull a budget range (DKK) from free text. Returns {min,max} in whole DKK. */
// ── Money extraction ──────────────────────────────────────────────────────
//
// An amount only counts when the text marks it as money: a currency next to it
// ("kr. 75.000", "11,6 mio. kr.", "€1.2m", "75.000,-") or a value label before
// it ("Anslået værdi: 4 000 000", "Budget: 50.000"). Bare numbers ("omkring
// 6.000 dyrlæger") are never prices. When a text holds several amounts, a
// labelled contract value beats a budget/price label, which beats any other
// currency amount; within the same rank the largest wins (tenders list options
// and lots below the total). Hourly/daily rates are kept only when no project
// amount exists.

const NUM = String.raw`\d{1,3}(?:[.,  ]\d{3})+(?:[.,]\d{1,2})?(?!\d)|\d+(?:[.,]\d+)?`;
const SCALE = String.raw`(?:\s?(mia\.?|mrd\.?|milliard(?:er)?|billions?|bn|mio\.?|mill?\.?|millioner|millions?|mn|m(?![a-zæøå0-9²])|k(?![a-zæøå])|t\.(?=\s?kr)|tusinde?|thousand))?`;
const CUR_PRE = String.raw`(kr\.?(?![a-zæøå])|dkk|eur(?![a-zæøå])|€|usd|\$|sek|nok|gbp|£)`;
const CUR_POST = String.raw`(kr\.?(?![a-zæøå])|kroner|danske kroner|dkk|eur(?:o|os)?(?![a-zæøå])|€|usd|\$|sek|nok|gbp|£|,-)`;
const RANGE_SEP = String.raw`\s?(?:-|–|—|til|to)\s?`;
const CONTRACT_LABEL = String.raw`anslået (?:samlet |total )?værdi|anslaaet vaerdi|estimeret (?:samlet )?værdi|kontraktværdi|kontraktens (?:samlede |anslåede )?værdi|samlet (?:kontrakt)?værdi|udbuddets (?:samlede )?værdi|estimated (?:total )?value|total (?:contract )?value|contract value|værdi(?:en)?`;
const PRICE_LABEL = String.raw`budget(?:ramme|tet|get)?|pris(?:en)?|honorar|beløb(?:et)?|ramme(?!aftale)|vederlag|price|fee|compensation`;
const RATE_LABEL = String.raw`timepris|timeløn|timesats|dagspris|dagsats|hourly rate|day rate|daily rate|rate`;
const NOT_MONEY_AFTER = /^\s?(?:%|procent|percent|år\b|years?\b|måneder|months?\b|dage\b|days?\b|timer\b|hours\b|stk|personer|people|ansatte|employees|medarbejdere|brugere|users|dyrlæger|borgere|elever|m2|m²|kvm|km\b)/;
const RATE_AFTER = /^\s?(?:\/|pr\.?|per|om|i|an?)\s?(?:time[nr]?\b|hour\b|hr\b|h\b|dag(?:en)?\b|day\b|måned(?:en)?\b|md\.?|month\b|uge(?:n)?\b|week\b)/;
const MAX_INT = 2_147_483_647;

type MoneyKind = "contract" | "price" | "amount" | "rate";
interface MoneyMention {
  min?: number;
  value: number;
  currency?: string;
  kind: MoneyKind;
  index: number;
  quote: string;
}

function currencyCode(token?: string): string | undefined {
  if (!token) return undefined;
  if (/^(?:kr|kroner|danske kroner|dkk|,-)/.test(token)) return "DKK";
  if (/^(?:eur|€)/.test(token)) return "EUR";
  if (/^(?:usd|\$)/.test(token)) return "USD";
  if (token === "sek") return "SEK";
  if (token === "nok") return "NOK";
  if (/^(?:gbp|£)/.test(token)) return "GBP";
  return undefined;
}

/** "4.000.000" / "4 000 000" / "4,000,000" / "1.100.000,50" / "11,6" / "11.6". */
export function parseAmount(raw: string): number {
  const s = raw.replace(/[\s ]/g, "");
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(s)) return parseFloat(s.replace(/,/g, ""));
  if (/^\d+[.,]\d+$/.test(s)) return parseFloat(s.replace(",", "."));
  return parseFloat(s);
}

function scaleFactor(token?: string): number {
  if (!token) return 1;
  if (/^(?:mia|mrd|milliard|billion|bn)/.test(token)) return 1e9;
  if (/^(?:mio|mil|million|mn|m$)/.test(token)) return 1e6;
  if (/^(?:k|t\.|tusind|thousand)/.test(token)) return 1e3;
  return 1;
}

function isYearLike(raw: string, value: number) {
  return /^\d{4}$/.test(raw.trim()) && value >= 1900 && value <= 2100;
}

/** Every amount in the text that is marked as money. */
export function findMoneyMentions(text: string): MoneyMention[] {
  if (!text) return [];
  const t = text.toLowerCase().replace(/ /g, " ");
  const mentions: MoneyMention[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  const quoteAt = (index: number, length: number) => text.slice(Math.max(0, index - 60), index + length + 60).replace(/\s+/g, " ").trim();
  const rateAfter = (end: number) => RATE_AFTER.test(t.slice(end, end + 24));
  const push = (m: Omit<MoneyMention, "quote">, length: number) => {
    if (!Number.isFinite(m.value) || m.value <= 0 || m.value > MAX_INT) return;
    if (m.min != null && (!Number.isFinite(m.min) || m.min > m.value)) delete m.min;
    if (m.kind !== "rate" && m.value < 100) return;
    taken.push([m.index, m.index + length]);
    mentions.push({ ...m, value: Math.round(m.value), min: m.min != null ? Math.round(m.min) : undefined, quote: quoteAt(m.index, length) });
  };
  const label = (before: string): MoneyKind | null => {
    if (new RegExp(`(?:${RATE_LABEL})[^\\d]{0,25}$`).test(before)) return "rate";
    if (new RegExp(`(?:${CONTRACT_LABEL})[^\\d]{0,40}$`).test(before)) return "contract";
    if (new RegExp(`(?:${PRICE_LABEL})[^\\d]{0,30}$`).test(before)) return "price";
    return null;
  };

  // Ranges first, so "50.000 - 100.000 kr" is one mention, not two.
  const range = new RegExp(
    `(?:${CUR_PRE}\\s?)?(${NUM})${SCALE}\\s?(?:${CUR_POST})?${RANGE_SEP}(?:${CUR_PRE}\\s?)?(${NUM})${SCALE}\\s?(?:${CUR_POST})?`,
    "g",
  );
  for (const m of t.matchAll(range)) {
    const [whole, pre1, n1, s1, post1, pre2, n2, s2, post2] = m;
    const cur = currencyCode(pre1 || post2 || pre2 || post1);
    const before = t.slice(Math.max(0, m.index! - 60), m.index!);
    const kind = label(before);
    if (!cur && !kind && !s2) continue;
    if (isYearLike(n1, parseAmount(n1)) && isYearLike(n2, parseAmount(n2))) continue;
    const f2 = scaleFactor(s2);
    const f1 = s1 ? scaleFactor(s1) : f2;
    const min = parseAmount(n1) * f1;
    const max = parseAmount(n2) * f2;
    if (min < 100 || max < 100) continue;
    const rate = kind === "rate" || rateAfter(m.index! + whole.length);
    push({ min, value: max, currency: cur, kind: rate ? "rate" : kind ?? "amount", index: m.index! }, whole.length);
  }

  const single = [
    // currency before: "kr. 75.000", "€1.2m", "dkk 11,6 mio"
    new RegExp(`${CUR_PRE}\\s?(${NUM})${SCALE}`, "g"),
    // currency after: "11,6 mio. kr.", "4.000.000 dkk", "75.000,-"
    new RegExp(`(${NUM})${SCALE}\\s?${CUR_POST}`, "g"),
    // label before, currency optional: "anslået værdi: 4 000 000"
    new RegExp(`(?:${CONTRACT_LABEL}|${PRICE_LABEL}|${RATE_LABEL})[^\\d\\n]{0,40}?(${NUM})${SCALE}`, "g"),
  ];
  single.forEach((pattern, which) => {
    for (const m of t.matchAll(pattern)) {
      const whole = m[0];
      let cur: string | undefined, raw: string, scale: string | undefined;
      if (which === 0) [, cur, raw, scale] = m;
      else if (which === 1) [, raw, scale, cur] = m;
      else [, raw, scale] = m;
      const numStart = m.index! + whole.lastIndexOf(raw);
      if (overlaps(numStart, numStart + raw.length)) continue;
      const end = m.index! + whole.length;
      const after = t.slice(end, end + 20);
      if (which === 2 && NOT_MONEY_AFTER.test(after)) continue;
      const trailing = which === 2 ? after.match(new RegExp(`^\\s?${CUR_POST}`)) : null;
      const currency = currencyCode(cur ?? trailing?.[1]);
      const value = parseAmount(raw) * scaleFactor(scale);
      if (which === 2) {
        // A label alone needs a currency, a scale word, or a clearly monetary size.
        if (!currency && !scale && value < 10_000) continue;
        if (!currency && !scale && isYearLike(raw, value)) continue;
      }
      const before = t.slice(Math.max(0, m.index! - 60), which === 2 ? m.index! + whole.indexOf(raw) : m.index!);
      const kind = label(before) ?? "amount";
      const rate = kind === "rate" || rateAfter(end + (trailing?.[0].length ?? 0));
      push({ value, currency, kind: rate ? "rate" : kind, index: numStart }, raw.length);
    }
  });
  return mentions.sort((a, b) => a.index - b.index);
}

const KIND_RANK: Record<MoneyKind, number> = { contract: 3, price: 2, amount: 1, rate: 0 };

/** The best project value (or, failing that, rate) in a text. */
export function extractBudget(text: string): {
  min?: number;
  max?: number;
  currency?: string;
  quote?: string;
} {
  if (!text) return {};
  const t = text.toLowerCase();
  const fallbackCurrency = /\beur\b|€/.test(t) ? "EUR" : /\busd\b|\$/.test(t) ? "USD" : "DKK";
  const mentions = findMoneyMentions(text);
  if (!mentions.length) return { currency: fallbackCurrency };
  const best = [...mentions].sort(
    (a, b) => KIND_RANK[b.kind] - KIND_RANK[a.kind] || b.value - a.value || a.index - b.index,
  )[0];
  return {
    ...(best.min != null ? { min: best.min } : {}),
    max: best.value,
    currency: best.currency ?? fallbackCurrency,
    quote: best.quote,
  };
}

/** Pull a deadline date from free text (Danish + ISO). */
export function extractDeadline(text: string): Date | null {
  if (!text) return null;
  const t = text.toLowerCase();

  // ISO yyyy-mm-dd
  const iso = t.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return makeDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // dd/mm/yyyy, dd.mm.yyyy or dd-mm-yyyy, optionally with HH.mm / HH:mm.
  const dmy = t.match(
    /(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?:\s+(\d{1,2})[.:](\d{2}))?/,
  );
  if (dmy) {
    return makeDate(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      dmy[4] ? Number(dmy[4]) : 23,
      dmy[5] ? Number(dmy[5]) : 59,
    );
  }

  // "15. marts 2026" / "15 marts"
  const da = t.match(/(\d{1,2})\.?\s+([a-zæøå]+)\s*(20\d{2})?(?:\s+(?:kl\.?\s*)?(\d{1,2})[.:](\d{2}))?/);
  if (da && MONTHS_DA[da[2]] != null) {
    const year = da[3] ? Number(da[3]) : new Date().getFullYear();
    return makeDate(year, MONTHS_DA[da[2]], Number(da[1]), da[4] ? Number(da[4]) : 23, da[5] ? Number(da[5]) : 59);
  }
  return null;
}

export function detectApplicationRoute(
  text: string,
): "DIRECT" | "APPLICATION" | "UNKNOWN" {
  const t = (text || "").toLowerCase();
  if (/ansøg|ansøgning|application|apply|udfyld|formular|deadline for/.test(t))
    return "APPLICATION";
  if (/kontakt|contact|skriv til|ring|email|e-mail|@/.test(t)) return "DIRECT";
  return "UNKNOWN";
}

/** Long source pages contain publication and event dates; only a deadline cue is evidence of a deadline. */
export function extractExplicitDeadline(text: string): Date | null {
  const cue =
    /(?:ansøgningsfrist|tilbudsfrist|deadline|closing date|apply by|frist)\s*[:：]?\s*([^\n]{0,90})/i.exec(
      text,
    );
  return cue ? extractDeadline(cue[1]) : null;
}
