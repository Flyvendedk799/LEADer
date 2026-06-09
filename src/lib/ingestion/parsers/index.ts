import type * as cheerio from "cheerio";
import type { OpportunityCandidate } from "../dedupe";

// ─────────────────────────────────────────────────────────────────────────
// SITE-SPECIFIC PARSERS
//
// Each parser maps a loaded Cheerio document → opportunity candidates using
// selectors tuned to one site. A Source row references a parser by `parserKey`.
//
// ▸ HOW TO ADD A REAL PARSER (highest-leverage next step):
//   1. Inspect the target PUBLIC page's HTML (must be reachable without login).
//   2. Confirm robots.txt + ToS allow automated access (see docs/COMPLIANCE.md).
//   3. Write selectors for the opportunity card list + fields.
//   4. Register it in the PARSERS map below and set the Source.parserKey.
//
// The stubs below intentionally return [] (fall back to the generic extractor)
// and document the selectors a real implementation would target.
// ─────────────────────────────────────────────────────────────────────────

export type SiteParser = (
  $: cheerio.CheerioAPI,
  pageUrl: string,
) => OpportunityCandidate[];

// TODO(parser): EHSYS — implement real selectors for the public listing.
const ehsys: SiteParser = (_$, _url) => [];

// TODO(parser): Beyond Beta — public programme / opportunity pages.
const beyondBeta: SiteParser = (_$, _url) => [];

// TODO(parser): Erhvervshuse — public funding/voucher programme listings.
const erhvervshuse: SiteParser = (_$, _url) => [];

// TODO(parser): generic accelerator programme page (cohort calls, open applications).
const accelerator: SiteParser = (_$, _url) => [];

// TODO(parser): public procurement portal (tender-like listings, where ToS permits).
const procurement: SiteParser = (_$, _url) => [];

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
