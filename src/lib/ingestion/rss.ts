import Parser from "rss-parser";
import type { OpportunityCandidate } from "./dedupe";
import { crawlerSettings } from "./compliance";
import { assertPublicUrl } from "./net";

const parser = new Parser({
  headers: { "User-Agent": crawlerSettings().userAgent },
  timeout: crawlerSettings().timeoutMs,
});

/**
 * Fetch an RSS/Atom feed and map items to opportunity candidates.
 * RSS is published for syndication, so this is the most clearly-compliant lane.
 */
export async function fetchRssCandidates(
  feedUrl: string,
  keywords: string[] = [],
): Promise<OpportunityCandidate[]> {
  // SSRF gate: reject localhost/private/metadata hosts before the parser fetches.
  await assertPublicUrl(feedUrl);
  const feed = await parser.parseURL(feedUrl);
  const kw = keywords.map((k) => k.toLowerCase()).filter(Boolean);

  const candidates: OpportunityCandidate[] = (feed.items || []).map((item) => {
    const content =
      (item as { contentSnippet?: string; content?: string }).contentSnippet ||
      (item as { content?: string }).content ||
      item.summary ||
      "";
    return {
      title: item.title?.trim() || "Untitled",
      description: content,
      rawContent: `${item.title || ""}\n\n${content}`,
      url: item.link,
      postedAt: item.isoDate ? new Date(item.isoDate) : null,
      organization: feed.title,
      applicationRoute: "UNKNOWN",
    };
  });

  if (kw.length === 0) return candidates;
  return candidates.filter((c) => {
    const hay = `${c.title} ${c.description}`.toLowerCase();
    return kw.some((k) => hay.includes(k));
  });
}
