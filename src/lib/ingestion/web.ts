import * as cheerio from "cheerio";
import type { OpportunityCandidate } from "./dedupe";
import { crawlerSettings, isAllowedByRobots, rateLimit } from "./compliance";
import { assertPublicUrl, safeFetch } from "./net";
import { getParser } from "./parsers";
import { extractStructured } from "./parsers/structured";

/**
 * Same-host links still inside the page budget. Used to cap a crawl at
 * `CRAWLER_MAX_PAGES_PER_RUN` without leaving the source host.
 */
export function collectSameHostLinks(
  hrefs: Array<string | undefined>,
  pageUrl: string,
  seen: Set<string>,
  limit: number,
): string[] {
  if (limit <= 0) return [];
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const href of hrefs) {
    if (!href || out.length >= limit) break;
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (
      abs.origin !== origin ||
      (abs.protocol !== "http:" && abs.protocol !== "https:")
    )
      continue;
    abs.hash = "";
    const normalized = abs.toString();
    if (seen.has(normalized) || out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

/**
 * Fetch PUBLIC web pages (no login, robots-checked, rate-limited) and extract
 * opportunity candidates. Uses a site-specific parser when `parserKey` matches,
 * otherwise a conservative generic extractor.
 *
 * Playwright renders a single page when CRAWLER_ENABLE_PLAYWRIGHT is 1 or true.
 * That path is for local/self-host runs. The default, including Vercel cron,
 * stays a cheerio fetch and may follow same-host links up to the page cap.
 */
export async function fetchWebCandidates(
  pageUrl: string,
  opts: {
    keywords?: string[];
    parserKey?: string | null;
    maxPages?: number;
  } = {},
): Promise<OpportunityCandidate[]> {
  const settings = crawlerSettings();
  const maxPages = settings.playwrightEnabled
    ? 1
    : Math.max(
        1,
        Math.min(
          opts.maxPages ?? settings.maxPagesPerRun,
          settings.maxPagesPerRun,
        ) || 1,
      );
  const queue = [pageUrl];
  const seenPages = new Set<string>();
  const collected: OpportunityCandidate[] = [];

  while (queue.length > 0 && seenPages.size < maxPages) {
    const next = queue.shift();
    if (!next || seenPages.has(next)) continue;
    seenPages.add(next);

    await assertPublicUrl(next);
    const allowed = await isAllowedByRobots(next);
    if (!allowed) {
      if (seenPages.size === 1)
        throw new Error(`Blocked by robots.txt: ${next}`);
      continue;
    }
    await rateLimit(next);

    const html = await loadPageHtml(next, settings);
    const $ = cheerio.load(html);
    const siteParser = getParser(opts.parserKey);
    collected.push(
      ...(siteParser ? siteParser($, next) : genericExtract($, next)),
    );

    if (settings.playwrightEnabled || seenPages.size >= maxPages) break;
    const hrefs: string[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href) hrefs.push(href);
    });
    const seen = new Set<string>([...seenPages, ...queue]);
    queue.push(
      ...collectSameHostLinks(hrefs, next, seen, maxPages - seenPages.size),
    );
  }

  const kw = (opts.keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  if (kw.length === 0) return collected;
  return collected.filter((c) => {
    const hay = `${c.title} ${c.description}`.toLowerCase();
    return kw.some((k) => hay.includes(k));
  });
}

async function loadPageHtml(
  pageUrl: string,
  settings: ReturnType<typeof crawlerSettings>,
): Promise<string> {
  if (settings.playwrightEnabled) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: settings.userAgent });
      await page.goto(pageUrl, {
        timeout: settings.timeoutMs,
        waitUntil: "domcontentloaded",
      });
      return await page.content();
    } finally {
      await browser.close();
    }
  }

  const res = await safeFetch(pageUrl, {
    headers: { "User-Agent": settings.userAgent },
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  if (res.status < 200 || res.status >= 300)
    throw new Error(`Fetch failed (${res.status}) for ${pageUrl}`);
  return res.text;
}

/**
 * Generic extractor. Order of preference:
 *   1. Structured data (JSON-LD / microdata) — reliable across modern sites.
 *   2. Repeated "card"-like structures.
 *   3. The page's main heading + meta description as a single candidate.
 * Site-specific selectors live in lib/ingestion/parsers (referenced by parserKey).
 */
function genericExtract(
  $: cheerio.CheerioAPI,
  pageUrl: string,
): OpportunityCandidate[] {
  const structured = extractStructured($, pageUrl);
  if (structured.length) return structured;

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
      let url = pageUrl;
      try {
        const parsed = new URL(link || pageUrl, pageUrl);
        if (!["https:", "http:"].includes(parsed.protocol)) return;
        url = parsed.toString();
      } catch {
        return;
      }
      seen.add(title);
      out.push({
        title: title.slice(0, 200),
        description: desc,
        rawContent: desc,
        url,
        applicationRoute: "UNKNOWN",
      });
    });
    if (out.length > 0) break;
  }

  if (out.length === 0) {
    const title =
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Untitled page";
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
