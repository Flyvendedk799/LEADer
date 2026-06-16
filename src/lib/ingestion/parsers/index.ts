import type * as cheerio from "cheerio";
import type { OpportunityCandidate } from "../dedupe";
import { extractStructured } from "./structured";

// ─────────────────────────────────────────────────────────────────────────
// SITE-SPECIFIC PARSERS
//
// A Source row references a parser by `parserKey`. Each parser turns a loaded
// Cheerio document into opportunity candidates. The strategy is layered:
//
//   1. Structured data first (JSON-LD / microdata) — the most robust signal and
//      what most modern public listings publish (see ./structured.ts).
//   2. Site-tuned CSS selectors (a CardConfig) as a fallback/supplement.
//
// Adding a real site = define its CardConfig (or a custom function) and set the
// Source.parserKey. Confirm robots.txt + ToS allow access first (docs/COMPLIANCE).
// ─────────────────────────────────────────────────────────────────────────

export type SiteParser = (
  $: cheerio.CheerioAPI,
  pageUrl: string,
) => OpportunityCandidate[];

/** Declarative selector config for list-style opportunity pages. */
export interface CardConfig {
  /** Selector for each repeated opportunity card/row. */
  item: string;
  /** Title selector within a card (defaults to the first heading/link). */
  title?: string;
  /** Link selector within a card (defaults to the first <a href>). */
  link?: string;
  /** Description/summary selector within a card. */
  description?: string;
  /** Organization selector within a card. */
  organization?: string;
  /** Deadline text selector within a card. */
  deadline?: string;
  /** Minimum description length to keep a card (filters nav noise). */
  minDescription?: number;
  /** Hard cap on candidates per page. */
  limit?: number;
}

function abs(href: string | undefined, pageUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return undefined;
  }
}

function clean(s: string | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** Generic, config-driven card extractor used by most site parsers. */
export function extractCards(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  cfg: CardConfig,
): OpportunityCandidate[] {
  const out: OpportunityCandidate[] = [];
  const seen = new Set<string>();
  const limit = cfg.limit ?? 60;
  const minDesc = cfg.minDescription ?? 30;

  $(cfg.item).each((_, el) => {
    if (out.length >= limit) return;
    const $el = $(el);

    const title = clean(
      cfg.title ? $el.find(cfg.title).first().text() : $el.find("h1,h2,h3,h4,a").first().text(),
    );
    if (!title || title.length < 6) return;

    const href = cfg.link
      ? $el.find(cfg.link).first().attr("href")
      : $el.find("a[href]").first().attr("href");

    const description = clean(
      cfg.description ? $el.find(cfg.description).first().text() : $el.text(),
    ).slice(0, 800);
    if (description.length < minDesc) return;

    const key = `${title}|${href ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      title: title.slice(0, 250),
      description,
      rawContent: clean($el.text()).slice(0, 4000),
      url: abs(href, pageUrl) || pageUrl,
      organization: cfg.organization ? clean($el.find(cfg.organization).first().text()) || undefined : undefined,
      applicationRoute: "UNKNOWN",
    });
  });

  return out;
}

/**
 * Compose a parser from a CardConfig: structured data first, then cards. If both
 * yield results we prefer structured (richer) but append card-only items whose
 * URLs aren't already covered.
 */
function fromConfig(cfg: CardConfig): SiteParser {
  return ($, pageUrl) => {
    const structured = extractStructured($, pageUrl);
    const cards = extractCards($, pageUrl, cfg);
    if (!structured.length) return cards;
    // Dedupe cards against structured items by URL — but never by the pageUrl
    // fallback, or a single structured node would wipe out every card that
    // lacks an absolute link (they all fall back to pageUrl).
    const seen = new Set(structured.map((c) => c.url).filter((u) => u && u !== pageUrl));
    return [...structured, ...cards.filter((c) => c.url === pageUrl || !seen.has(c.url))];
  };
}

// ── Site configs ──────────────────────────────────────────────────────────
// Selectors target common CMS/listing markup. Tune against the live page when
// onboarding a real source; structured-data extraction covers most sites even
// before the selectors are perfect.

const ehsys = fromConfig({
  item: "article, .opportunity, .listing-item, li.result",
  title: "h2 a, h3 a, .title, a",
  link: "h2 a, h3 a, a",
  description: ".excerpt, .summary, p",
  deadline: ".deadline, time",
  minDescription: 24,
});

const beyondBeta = fromConfig({
  item: ".programme, .program-card, article, .card",
  title: "h2, h3, .card-title, a",
  link: "a",
  description: ".description, .card-text, p",
  minDescription: 24,
});

const erhvervshuse = fromConfig({
  item: ".tilskud, .programme, article, .views-row, .card",
  title: "h2 a, h3 a, .field-title, a",
  link: "h2 a, h3 a, a",
  description: ".field-summary, .teaser, .summary, p",
  deadline: ".ansoegningsfrist, .deadline, time",
  minDescription: 24,
});

const accelerator = fromConfig({
  item: ".cohort, .program, .opportunity, article, .card",
  title: "h2, h3, .title, a",
  link: "a",
  description: ".description, .summary, p",
  minDescription: 24,
});

const procurement = fromConfig({
  item: ".tender, .udbud, tr.result, article, .search-result",
  title: ".tender-title, h2 a, h3 a, a",
  link: ".tender-title a, h2 a, h3 a, a",
  description: ".tender-summary, .description, .summary, td, p",
  deadline: ".deadline, .frist, time",
  minDescription: 20,
});

export const PARSERS: Record<string, SiteParser> = {
  ehsys,
  "beyond-beta": beyondBeta,
  erhvervshuse,
  accelerator,
  procurement,
};

export function getParser(key?: string | null): SiteParser | null {
  if (!key) return null;
  return PARSERS[key] ?? null;
}
