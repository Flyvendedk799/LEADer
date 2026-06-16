import * as cheerio from "cheerio";
import type { OpportunityCandidate } from "./dedupe";
import { crawlerSettings, isAllowedByRobots, rateLimit } from "./compliance";
import { assertPublicUrl, safeFetch } from "./net";
import { getParser } from "./parsers";
import { extractStructured } from "./parsers/structured";

/**
 * Fetch a PUBLIC web page (no login, robots-checked, rate-limited) and extract
 * opportunity candidates. Uses a site-specific parser when `parserKey` matches,
 * otherwise a conservative generic extractor.
 *
 * NOTE: Playwright (for JS-rendered public pages) is gated behind
 * CRAWLER_ENABLE_PLAYWRIGHT and intentionally left as a documented TODO so the
 * default path stays a simple, compliant fetch.
 */
export async function fetchWebCandidates(
  pageUrl: string,
  opts: { keywords?: string[]; parserKey?: string | null } = {},
): Promise<OpportunityCandidate[]> {
  const { userAgent, timeoutMs } = crawlerSettings();

  // SSRF gate FIRST: only public http(s) hosts (blocks localhost/private/metadata IPs).
  await assertPublicUrl(pageUrl);

  // Compliance gate: never fetch a path robots.txt disallows.
  const allowed = await isAllowedByRobots(pageUrl);
  if (!allowed) {
    throw new Error(`Blocked by robots.txt: ${pageUrl}`);
  }

  await rateLimit(pageUrl);

  const res = await safeFetch(pageUrl, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Fetch failed (${res.status}) for ${pageUrl}`);
  const html = res.text;
  const $ = cheerio.load(html);

  const siteParser = getParser(opts.parserKey);
  const candidates = siteParser
    ? siteParser($, pageUrl)
    : genericExtract($, pageUrl);

  const kw = (opts.keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  if (kw.length === 0) return candidates;
  return candidates.filter((c) => {
    const hay = `${c.title} ${c.description}`.toLowerCase();
    return kw.some((k) => hay.includes(k));
  });
}

/**
 * Generic extractor. Order of preference:
 *   1. Structured data (JSON-LD / microdata) — reliable across modern sites.
 *   2. Repeated "card"-like structures.
 *   3. The page's main heading + meta description as a single candidate.
 * Site-specific selectors live in lib/ingestion/parsers (referenced by parserKey).
 */
function genericExtract($: cheerio.CheerioAPI, pageUrl: string): OpportunityCandidate[] {
  const structured = extractStructured($, pageUrl);
  if (structured.length) return structured;

  const origin = new URL(pageUrl).origin;
  const out: OpportunityCandidate[] = [];

  const cardSelectors = [
    "article",
    ".card",
    "[class*='card']",
    "li[class*='item']",
    ".opportunity",
    ".grant",
    ".tender",
  ];
  const seen = new Set<string>();

  for (const sel of cardSelectors) {
    $(sel).each((_, el) => {
      if (out.length >= 40) return;
      const $el = $(el);
      const title = $el.find("h1,h2,h3,h4,a").first().text().trim();
      if (!title || title.length < 8 || seen.has(title)) return;
      const link = $el.find("a[href]").first().attr("href");
      const desc = $el.text().replace(/\s+/g, " ").trim().slice(0, 600);
      if (desc.length < 40) return;
      seen.add(title);
      out.push({
        title: title.slice(0, 200),
        description: desc,
        rawContent: desc,
        url: link ? new URL(link, origin).toString() : pageUrl,
        applicationRoute: "UNKNOWN",
      });
    });
    if (out.length > 0) break;
  }

  if (out.length === 0) {
    const title = $("h1").first().text().trim() || $("title").text().trim() || "Untitled page";
    const desc =
      $('meta[name="description"]').attr("content") ||
      $("p").first().text().trim() ||
      "";
    out.push({
      title: title.slice(0, 200),
      description: desc.slice(0, 600),
      rawContent: $("body").text().replace(/\s+/g, " ").trim().slice(0, 2000),
      url: pageUrl,
      applicationRoute: "UNKNOWN",
    });
  }

  return out;
}
