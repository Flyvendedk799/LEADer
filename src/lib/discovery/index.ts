import * as cheerio from "cheerio";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { runAi } from "@/lib/ai";
import {
  getStoredSearchApiKey,
  normalizeStoredAiKeys,
  type SearchProvider,
} from "@/lib/ai/keys";
import { ensureEmbedding } from "@/lib/opportunities/similar";
import { scoreOpportunity } from "@/lib/scoring";
import type {
  ApplicationRoute,
  ScoreBreakdown,
  ScoreWeights,
  SourceType,
  Workspace,
} from "@/lib/types";
import { AUTOMATABLE_SOURCE_TYPES } from "@/lib/types";
import { crawlerSettings, isAllowedByRobots, rateLimit } from "@/lib/ingestion/compliance";
import { dedupeHash, type OpportunityCandidate } from "@/lib/ingestion/dedupe";
import { detectApplicationRoute, extractBudget, extractDeadline } from "@/lib/ingestion/extract";
import { assertPublicUrl, safeFetch } from "@/lib/ingestion/net";
import { fetchRssCandidates } from "@/lib/ingestion/rss";
import { fetchWebCandidates } from "@/lib/ingestion/web";
export { DISCOVERY_PRESETS } from "./presets";

export interface DiscoverySearchInput {
  query: string;
  workspace?: Workspace;
  maxResults?: number;
  includeWeb?: boolean;
  includeSources?: boolean;
  provider?: "auto" | "tavily" | "brave" | "serper" | "none";
  resultKind?: "all" | "opportunities" | "sources";
}

export interface DiscoveryCandidateDto {
  id: string;
  candidateKind: "opportunity" | "source";
  title: string;
  description?: string;
  summaryDa?: string;
  rawContent?: string;
  detailText?: string;
  url?: string;
  organization?: string;
  location?: string;
  country?: string;
  region?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  priceText?: string;
  deadline?: string;
  postedAt?: string;
  freshness: "active" | "expired" | "stale" | "unknown";
  applicationRoute: ApplicationRoute;
  contacts: { name?: string; email?: string; role?: string }[];
  attachments: { label?: string; url: string; kind?: string }[];
  sourceName: string;
  sourceKind: "web-search" | "source-scan";
  provider: string;
  query: string;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  reasons: string[];
  signals: string[];
  feedback?: "GOOD_RESULT" | "NON_LEAD";
  alreadySaved?: { id: string; title: string };
  alreadySavedSource?: { id: string; name: string };
}

export interface DiscoverySearchResult {
  candidates: DiscoveryCandidateDto[];
  queries: string[];
  provider: string;
  providerConfigured: boolean;
  sourceScanCount: number;
  warnings: string[];
}

interface SearchResult {
  title: string;
  url?: string;
  snippet?: string;
  sourceName?: string;
  publishedAt?: string | Date | null;
  provider: string;
  query: string;
}

export type DiscoveryCandidateSaveInput = {
  id?: string;
  candidateKind?: "opportunity" | "source";
  title: string;
  description?: string;
  summaryDa?: string;
  rawContent?: string;
  detailText?: string;
  url?: string;
  organization?: string;
  location?: string;
  country?: string;
  region?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  priceText?: string;
  deadline?: string;
  postedAt?: string;
  freshness?: "active" | "expired" | "stale" | "unknown";
  applicationRoute?: ApplicationRoute;
  contacts?: { name?: string; email?: string; role?: string }[];
  attachments?: { label?: string; url: string; kind?: string }[];
  sourceName?: string;
  sourceKind?: "web-search" | "source-scan";
  provider?: string;
  query?: string;
  signals?: string[];
  feedback?: "GOOD_RESULT" | "NON_LEAD";
};

interface UserProfile {
  id: string;
  headline: string | null;
  bio: string | null;
  preferredProjectTypes: string[];
  excludedCategories: string[];
  budgetMaxDkk: number;
  scoringWeights: Prisma.JsonValue;
  aiKeys: Prisma.JsonValue;
}

const MAX_PAGE_FETCHES = 10;
const MAX_SCAN_SOURCES = 8;
const MAX_ATTACHMENTS = 8;
const STALE_WITHOUT_DEADLINE_DAYS = 180;

const CURATED_DK_DISCOVERY_SOURCES = [
  {
    name: "EHSYS — aktuelle indkøb",
    url: "https://ehsys.dk/indkoeb/alle",
    type: "PUBLIC_WEB" as SourceType,
    parserKey: "ehsys-procurement",
    keywords: [] as string[],
    country: "DK",
    region: undefined as string | undefined,
    category: "Tender",
  },
] as const;

function cleanText(value = "", max = 1600): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function searchProviderFromEnv(
  requested: DiscoverySearchInput["provider"] = "auto",
  aiKeys?: unknown,
): { provider: SearchProvider | "none"; apiKey: string; configured: boolean; source: "user" | "env" | "none" } {
  if (requested === "none") {
    return { provider: "none", apiKey: "", configured: false, source: "none" };
  }

  const stored = normalizeStoredAiKeys(aiKeys);
  const providers =
    requested === "auto"
      ? ([
          stored?.searchProvider,
          "tavily",
          "brave",
          "serper",
        ].filter(Boolean) as SearchProvider[])
      : [requested as SearchProvider];
  const ordered = [...new Set(providers)];

  for (const provider of ordered) {
    const apiKey = getStoredSearchApiKey(aiKeys, provider);
    if (apiKey) return { provider, apiKey, configured: true, source: "user" };
  }

  const envKeys: Record<SearchProvider, string | undefined> = {
    tavily: process.env.TAVILY_API_KEY,
    brave: process.env.BRAVE_SEARCH_API_KEY,
    serper: process.env.SERPER_API_KEY,
  };
  for (const provider of ordered) {
    const apiKey = envKeys[provider]?.trim();
    if (apiKey) return { provider, apiKey, configured: true, source: "env" };
  }

  return {
    provider: requested === "auto" ? "none" : requested ?? "none",
    apiKey: "",
    configured: false,
    source: "none",
  };
}

function profileText(user: UserProfile): string {
  return cleanText(
    [
      user.headline,
      user.bio,
      user.preferredProjectTypes.length
        ? `Preferred work: ${user.preferredProjectTypes.join(", ")}`
        : "",
      `Budget preference: under ${user.budgetMaxDkk.toLocaleString("da-DK")} DKK`,
    ]
      .filter(Boolean)
      .join("\n"),
    1200,
  );
}

function buildQueries(query: string, workspace: Workspace): string[] {
  const q = cleanText(query, 280);
  const country = workspace === "DK" ? "Danmark" : "Europe remote";
  const terms =
    workspace === "DK"
      ? [
          q,
          `${q} site:ehsys.dk/indkoeb/alle OR site:beyondbeta.ehsys.dk/indkoeb/tilbud/indsend OR site:ivaerksaetter.ehsys.dk/indkoeb/tilbud/indsend`,
          `${q} ${country} udbud software udvikling IT konsulent`,
          `${q} ${country} EHSYS indkøb tilbud Beyond Beta teknisk sparring produkt roadmap`,
          `${q} ${country} SMV Digital digitalisering rådgivning software`,
        ]
      : [
          q,
          `${q} funded startup MVP fullstack software project remote`,
          `${q} grant voucher innovation software supplier`,
        ];
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 4);
}

function sourceLabel(url?: string): string {
  if (!url) return "Unknown source";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown source";
  }
}

function parseMaybeDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaDate(value?: string | Date | null): string | undefined {
  const date = parseMaybeDate(value);
  if (!date) return undefined;
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function absoluteUrl(href: string | undefined, pageUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function attachmentKind(url: string, label = ""): string | undefined {
  const hay = `${url} ${label}`.toLowerCase();
  if (/\.pdf(?:[?#]|$)|\bpdf\b/.test(hay)) return "pdf";
  if (/\.(?:docx?|odt)(?:[?#]|$)|\bdokument\b|\bdocument\b/.test(hay)) return "doc";
  if (/\.(?:xlsx?|csv)(?:[?#]|$)|\bexcel\b|\bark\b|\bsheet\b/.test(hay)) return "sheet";
  if (/\.(?:png|jpe?g|webp)(?:[?#]|$)/.test(hay)) return "image";
  if (/\bdownload\b|\bhent\b|\bbilag\b|\battachment\b|\bmateriale\b/.test(hay)) return "link";
  return undefined;
}

function isAttachmentLink(url: string, label = ""): boolean {
  return Boolean(attachmentKind(url, label));
}

function attachmentLabel(url: string, label?: string): string {
  const cleaned = cleanText(label || "", 90);
  if (cleaned) return cleaned;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    return cleanText(name || url, 90);
  } catch {
    return cleanText(url, 90);
  }
}

function dedupeAttachments(
  attachments: { label?: string; url: string; kind?: string }[] = [],
): { label?: string; url: string; kind?: string }[] {
  const seen = new Set<string>();
  const out: { label?: string; url: string; kind?: string }[] = [];
  for (const attachment of attachments) {
    if (!attachment.url || seen.has(attachment.url)) continue;
    seen.add(attachment.url);
    out.push({
      label: attachmentLabel(attachment.url, attachment.label),
      url: attachment.url,
      kind: attachment.kind || attachmentKind(attachment.url, attachment.label),
    });
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}

function extractAttachments(
  $: cheerio.CheerioAPI,
  pageUrl: string,
): { label?: string; url: string; kind?: string }[] {
  const attachments: { label?: string; url: string; kind?: string }[] = [];
  const selfKind = attachmentKind(pageUrl);
  if (selfKind) {
    attachments.push({
      label: attachmentLabel(pageUrl),
      url: pageUrl,
      kind: selfKind,
    });
  }

  $("a[href]").each((_, el) => {
    if (attachments.length >= MAX_ATTACHMENTS * 2) return;
    const $el = $(el);
    const url = absoluteUrl($el.attr("href"), pageUrl);
    if (!url) return;
    const label = cleanText($el.text() || $el.attr("title") || $el.attr("aria-label") || "", 120);
    if (!isAttachmentLink(url, label)) return;
    attachments.push({
      label: attachmentLabel(url, label),
      url,
      kind: attachmentKind(url, label),
    });
  });

  return dedupeAttachments(attachments);
}

function extractPriceText(text: string): string | undefined {
  if (!text) return undefined;
  const lines = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => cleanText(line, 260))
    .filter(Boolean);
  const matches = lines.filter((line) =>
    /(?:\bpris\b|\bbudget\b|\bhonorar\b|\btilskud\b|\bbevilling\b|\bramme\b|\bbeløb\b|\bvaerdi\b|\bværdi\b|\bdkk\b|\bkr\.?\b|€|eur|\d[\d., ]{2,}\s*(?:kr|dkk|kroner))/i.test(line),
  );
  return matches.length ? cleanText([...new Set(matches)].slice(0, 3).join(" "), 520) : undefined;
}

function freshnessFor(
  candidate: OpportunityCandidate,
  kind: DiscoveryCandidateDto["candidateKind"],
): DiscoveryCandidateDto["freshness"] {
  if (kind === "source") return "active";
  const deadline = parseMaybeDate(candidate.deadline);
  if (deadline) return deadline.getTime() >= Date.now() ? "active" : "expired";
  const postedAt = parseMaybeDate(candidate.postedAt);
  if (postedAt && daysSince(postedAt) > STALE_WITHOUT_DEADLINE_DAYS) return "stale";
  return "unknown";
}

function isConcreteOpportunityUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\/indkoeb\/tilbud\/indsend\/|\/indkøb\/tilbud\/indsend\/|\/opportunit(?:y|ies)\/|\/tender\/|\/udbud\/[^/]{8,}/.test(
      pathname,
    );
  } catch {
    return false;
  }
}

function isSourceLikeCandidate(candidate: OpportunityCandidate, detailText: string): boolean {
  if (isConcreteOpportunityUrl(candidate.url)) return false;
  const text = `${candidate.title} ${candidate.description ?? ""} ${detailText}`.toLowerCase();
  const hasConcreteDeadline =
    Boolean(candidate.deadline) ||
    /tilbudsfrist|ansøgningsfrist|ansøgningsfrist|deadline|frist for tilbud|submission deadline/.test(text);
  const hasApplyCue =
    candidate.applicationRoute === "APPLICATION" ||
    /indsend tilbud|send tilbud|ansøg nu|ansoeg nu|apply now|submit proposal|giv tilbud/.test(text);
  const sourceCue =
    /find tenders?|match your company|udbudsportal|udbudsportalen|udbudsliste|tender portal|procurement platform|alle udbud|aktuelle indkøb|aktuelle indkoeb|liste over|oversigt over|samlet oversigt|database|markedsplads|hvor finder|it-udbud|herkules|offentlige udbud|søg efter udbud|soeg efter udbud/.test(
      text,
    );
  const pathCue = (() => {
    if (!candidate.url) return false;
    try {
      const pathname = new URL(candidate.url).pathname.toLowerCase();
      return /\/alle\/?$|\/sources?\/?$|\/kilder?\/?$|\/udbud\/?$|\/indkoeb\/alle\/?$|\/indkøb\/alle\/?$/.test(pathname);
    } catch {
      return false;
    }
  })();

  if (pathCue) return true;
  if (!sourceCue) return false;
  return !hasConcreteDeadline || !hasApplyCue || /herkules|it-udbud|portal|database|liste|oversigt/.test(text);
}

function buildDanishSummary(
  candidate: OpportunityCandidate,
  kind: DiscoveryCandidateDto["candidateKind"],
  priceText?: string,
): string {
  const deadline = formatDaDate(candidate.deadline);
  const postedAt = formatDaDate(candidate.postedAt);
  const budget =
    candidate.budgetMin != null && candidate.budgetMax != null
      ? `${candidate.budgetMin.toLocaleString("da-DK")}-${candidate.budgetMax.toLocaleString("da-DK")} ${candidate.currency ?? "DKK"}`
      : candidate.budgetMax != null
        ? `op til ${candidate.budgetMax.toLocaleString("da-DK")} ${candidate.currency ?? "DKK"}`
        : candidate.budgetMin != null
          ? `fra ${candidate.budgetMin.toLocaleString("da-DK")} ${candidate.currency ?? "DKK"}`
          : undefined;
  const org = candidate.organization ? ` hos ${candidate.organization}` : "";
  const body = cleanText(candidate.description || candidate.rawContent || "", 360);

  if (kind === "source") {
    return cleanText(
      [
        `Kildeside med relevante udbud eller opgavelister${org}.`,
        body ? `Den ser ud til at være nyttig som løbende søgekilde: ${body}` : "",
      ].join(" "),
      760,
    );
  }

  return cleanText(
    [
      `Mulig opgave${org}: ${body || candidate.title}.`,
      deadline ? `Tilbudsfrist: ${deadline}.` : "",
      budget ? `Budget/pris: ${budget}.` : priceText ? `Prisinfo: ${priceText}.` : "",
      postedAt ? `Fundet/annonceret: ${postedAt}.` : "",
    ].join(" "),
    760,
  );
}

function categoryFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\bai\b|llm|kunstig intelligens|automation|automatisering|chatbot/.test(t)) return "AI / automation";
  if (/mvp|prototype|proof.of.concept|poc|startup|founder/.test(t)) return "MVP / prototype";
  if (/smv.?digital|voucher|tilskud|bevilling|innobooster|erhvervshus/.test(t)) return "Voucher / grant";
  if (/udbud|tender|procurement|offentlig/.test(t)) return "Tender";
  if (/roadmap|strategi|architecture|arkitektur/.test(t)) return "Product strategy";
  return undefined;
}

function extractContacts(text: string): { name?: string; email?: string; role?: string }[] {
  const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])];
  return emails.slice(0, 3).map((email) => ({ email }));
}

function signalLabels(c: OpportunityCandidate): string[] {
  const text = `${c.title} ${c.description ?? ""} ${c.rawContent ?? ""}`.toLowerCase();
  const signals: string[] = [];
  if (c.budgetMin || c.budgetMax) signals.push("budget");
  if (c.deadline) signals.push("deadline");
  if (/mvp|prototype|poc/.test(text)) signals.push("MVP");
  if (/\bai\b|llm|automation|automatisering/.test(text)) signals.push("AI");
  if (/voucher|tilskud|bevilling|smv.?digital|innobooster/.test(text)) signals.push("funding");
  if (/udbud|tender|procurement/.test(text)) signals.push("udbud");
  if (/kontakt|contact|email|e-mail|@/.test(text)) signals.push("contactable");
  return [...new Set(signals)].slice(0, 6);
}

function discoveryFitAdjustment(c: OpportunityCandidate): { delta: number; notes: string[]; signals: string[] } {
  const text = `${c.title} ${c.description ?? ""} ${c.rawContent ?? ""}`.toLowerCase();
  const positive = [
    "teknisk", "technical", "software", "softwareudvikling", "udvikling",
    "developer", "udvikler", "app", "web", "platform", "produkt", "product",
    "roadmap", "mvp", "prototype", "poc", "proof of concept", "algoritme",
    "algorithm", "ai", "automation", "automatisering", "data", "integration",
    "security", "sikkerhed", "digitalisering", "system", "api", "saas",
  ];
  const negative = [
    "juridisk", "legal", "ip-rettigheder", "ip rights", "branding", "content",
    "salg", "sales", "fundraising", "soft funding", "investor readiness",
    "kommunikation", "communication", "regulatory", "classification", "claims",
    "dossier", "biosafety", "lab training", "masterclass", "masterclasses",
    "kapitalrejsning",
  ];
  const positiveHits = positive.filter((term) =>
    term === "ai" ? /\bai\b/.test(text) : text.includes(term),
  );
  const negativeHits = negative.filter((term) => text.includes(term));
  let delta = 0;
  const notes: string[] = [];
  const signals: string[] = [];

  if (positiveHits.length >= 2) {
    delta += 14;
    notes.push("Stærkt teknisk/product signal");
    signals.push("technical fit");
  } else if (positiveHits.length === 1) {
    delta += 6;
    notes.push("Noget teknisk/product signal");
  } else {
    delta -= 18;
    notes.push("Svagt teknisk/software signal");
  }

  if (negativeHits.length >= 2) {
    delta -= 35;
    notes.push("Ser ud til at være rådgivning/admin frem for kode");
    signals.push("low fit");
  } else if (negativeHits.length === 1) {
    delta -= 22;
    notes.push("Muligvis ikke en kodningsopgave");
  }

  if (/beyond beta|ehsys|indkøb|indkoeb|tilbudsfrist/.test(text) && positiveHits.length > 0) {
    delta += 6;
    signals.push("supplier lead");
  }

  return { delta, notes, signals };
}

function reasonsFromScore(breakdown: ScoreBreakdown): string[] {
  return breakdown.components
    .filter((c) => c.raw >= 0.45)
    .slice(0, 4)
    .map((c) => (c.note ? `${c.label}: ${c.note}` : c.label));
}

function enrichCandidate(input: OpportunityCandidate, fallback: Partial<OpportunityCandidate> = {}) {
  const text = cleanText(
    `${input.title}\n${input.description ?? ""}\n${input.rawContent ?? ""}`,
    6000,
  );
  const budget =
    input.budgetMax == null && input.budgetMin == null ? extractBudget(text) : {};
  const deadline = input.deadline ?? extractDeadline(text);
  const applicationRoute =
    input.applicationRoute && input.applicationRoute !== "UNKNOWN"
      ? input.applicationRoute
      : detectApplicationRoute(text);
  return {
    ...fallback,
    ...input,
    description: input.description || fallback.description,
    rawContent: input.rawContent || text,
    budgetMin: input.budgetMin ?? budget.min,
    budgetMax: input.budgetMax ?? budget.max,
    currency: input.currency ?? budget.currency ?? fallback.currency ?? "DKK",
    deadline,
    applicationRoute,
    contacts: input.contacts?.length ? input.contacts : extractContacts(text),
    category: input.category ?? fallback.category ?? categoryFromText(text),
  } satisfies OpportunityCandidate;
}

async function fetchReadablePage(
  url?: string,
): Promise<{
  title?: string;
  description?: string;
  text?: string;
  attachments?: { label?: string; url: string; kind?: string }[];
}> {
  if (!url) return {};
  const { userAgent, timeoutMs } = crawlerSettings();
  try {
    await assertPublicUrl(url);
    if (!(await isAllowedByRobots(url))) return {};
    await rateLimit(url);
    const res = await safeFetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status < 200 || res.status >= 300) return {};
    const finalUrl = res.url || url;
    if (attachmentKind(finalUrl) === "pdf") {
      return {
        title: attachmentLabel(finalUrl),
        attachments: dedupeAttachments([{ label: attachmentLabel(finalUrl), url: finalUrl, kind: "pdf" }]),
      };
    }
    const $ = cheerio.load(res.text);
    $("script,style,noscript,svg").remove();
    const title = cleanText($("h1").first().text() || $("title").text(), 220);
    const description = cleanText(
      $('meta[name="description"]').attr("content") || $("p").first().text(),
      700,
    );
    const text = cleanText($("body").text(), 5000);
    const attachments = extractAttachments($, finalUrl);
    return { title, description, text, attachments };
  } catch {
    const kind = url ? attachmentKind(url) : undefined;
    return kind && url
      ? { attachments: [{ label: attachmentLabel(url), url, kind }] }
      : { attachments: [] };
  }
}

async function enrichWithDetailPage(input: OpportunityCandidate): Promise<OpportunityCandidate> {
  if (!input.url) return input;
  const page = await fetchReadablePage(input.url);
  if (!page.title && !page.description && !page.text && !page.attachments?.length) return input;

  const rawContent = cleanText(
    [input.rawContent, page.description, page.text].filter(Boolean).join("\n"),
    9000,
  );
  const attachments = dedupeAttachments([...(input.attachments ?? []), ...(page.attachments ?? [])]);

  return enrichCandidate({
    ...input,
    description: cleanText([input.description, page.description].filter(Boolean).join("\n"), 1200) || input.description,
    rawContent: rawContent || input.rawContent,
    attachments,
  });
}

async function tavilySearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string; published_date?: string }[];
  };
  return (data.results ?? [])
    .filter((r) => r.title || r.url)
    .map((r) => ({
      title: r.title || r.url || "Untitled result",
      url: r.url,
      snippet: r.content,
      publishedAt: r.published_date,
      sourceName: sourceLabel(r.url),
      provider: "tavily",
      query,
    }));
}

async function braveSearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    country: "DK",
    search_lang: "da",
    count: String(Math.min(maxResults, 20)),
    safesearch: "moderate",
  });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok) throw new Error(`Brave search failed (${res.status})`);
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string; profile?: { name?: string } }[] };
  };
  return (data.web?.results ?? [])
    .filter((r) => r.title || r.url)
    .map((r) => ({
      title: r.title || r.url || "Untitled result",
      url: r.url,
      snippet: r.description,
      sourceName: r.profile?.name || sourceLabel(r.url),
      provider: "brave",
      query,
    }));
}

async function serperSearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, gl: "dk", hl: "da", num: Math.min(maxResults, 20) }),
  });
  if (!res.ok) throw new Error(`Serper search failed (${res.status})`);
  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string; source?: string; date?: string }[];
  };
  return (data.organic ?? [])
    .filter((r) => r.title || r.link)
    .map((r) => ({
      title: r.title || r.link || "Untitled result",
      url: r.link,
      snippet: r.snippet,
      sourceName: r.source || sourceLabel(r.link),
      publishedAt: r.date,
      provider: "serper",
      query,
    }));
}

async function runProviderSearch(
  provider: SearchProvider,
  apiKey: string,
  queries: string[],
  maxResults: number,
): Promise<SearchResult[]> {
  const perQuery = Math.max(3, Math.ceil(maxResults / Math.max(1, queries.length)));
  const out: SearchResult[] = [];
  for (const query of queries) {
    const results =
      provider === "tavily"
        ? await tavilySearch(query, perQuery, apiKey)
        : provider === "brave"
          ? await braveSearch(query, perQuery, apiKey)
          : await serperSearch(query, perQuery, apiKey);
    out.push(...results);
    if (out.length >= maxResults * 2) break;
  }
  return out;
}

async function searchResultsToCandidates(
  results: SearchResult[],
  user: UserProfile,
  workspace: Workspace,
  maxResults: number,
): Promise<DiscoveryCandidateDto[]> {
  const candidates: DiscoveryCandidateDto[] = [];
  const seen = new Set<string>();
  let pageFetches = 0;

  for (const result of results) {
    if (candidates.length >= maxResults) break;
    const page = result.url && pageFetches < MAX_PAGE_FETCHES ? await fetchReadablePage(result.url) : {};
    if (result.url) pageFetches++;

    const title = cleanText(page.title || result.title, 220);
    if (!title || seen.has(result.url || title.toLowerCase())) continue;
    seen.add(result.url || title.toLowerCase());

    const rawText = cleanText(
      [title, result.snippet, page.description, page.text].filter(Boolean).join("\n"),
      6000,
    );
    const enriched = enrichCandidate({
      title,
      description: cleanText(page.description || result.snippet || page.text || "", 900),
      rawContent: rawText,
      url: result.url,
      organization: result.sourceName,
      country: workspace === "DK" ? "DK" : undefined,
      workspace,
      postedAt: parseMaybeDate(result.publishedAt),
      attachments: page.attachments,
    } as OpportunityCandidate & { workspace?: Workspace });

    candidates.push(await toDiscoveryDto(enriched, user, {
      sourceName: result.sourceName || sourceLabel(result.url),
      sourceKind: "web-search",
      provider: result.provider,
      query: result.query,
    }));
  }
  return candidates;
}

async function scanSources(
  ownerId: string,
  query: string,
  user: UserProfile,
  workspace: Workspace,
  maxResults: number,
): Promise<{ candidates: DiscoveryCandidateDto[]; scanned: number; warnings: string[] }> {
  const warnings: string[] = [];
  const sources = await db.source.findMany({
    where: {
      ownerId,
      enabled: true,
      workspace,
      type: { in: AUTOMATABLE_SOURCE_TYPES as SourceType[] },
      url: { not: null },
    },
    orderBy: [{ lastCheckedAt: "asc" }, { createdAt: "desc" }],
    take: MAX_SCAN_SOURCES,
  });
  const scanTargets = [
    ...sources.map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      type: source.type as SourceType,
      keywords: source.keywords,
      parserKey: source.parserKey,
      country: source.country ?? undefined,
      region: source.region ?? undefined,
      category: source.category ?? undefined,
    })),
    ...(workspace === "DK" ? CURATED_DK_DISCOVERY_SOURCES : []),
  ];
  const candidates: DiscoveryCandidateDto[] = [];
  const queryKeywords = query
    .split(/[,\s]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 3)
    .slice(0, 10);

  for (const source of scanTargets) {
    if (!source.url || candidates.length >= maxResults) break;
    try {
      const isCurated = !("id" in source);
      const mergedKeywords = isCurated ? [] : [...new Set([...source.keywords, ...queryKeywords])];
      const raw =
        source.type === "RSS" || source.type === "NEWSLETTER"
          ? await fetchRssCandidates(source.url, mergedKeywords)
          : await fetchWebCandidates(source.url, {
              keywords: mergedKeywords,
              parserKey: source.parserKey,
            });
      for (const item of raw) {
        if (candidates.length >= maxResults) break;
        const enriched = await enrichWithDetailPage(
          enrichCandidate(item, {
            country: source.country ?? (workspace === "DK" ? "DK" : undefined),
            region: source.region ?? undefined,
            category: source.category ?? undefined,
          }),
        );
        candidates.push(await toDiscoveryDto(enriched, user, {
          sourceName: source.name,
          sourceKind: "source-scan",
          provider: "saved-sources",
          query,
        }));
      }
      if ("id" in source) {
        await db.source.update({ where: { id: source.id }, data: { lastCheckedAt: new Date() } });
      }
    } catch (e) {
      warnings.push(`${source.name}: ${e instanceof Error ? e.message : "scan failed"}`);
    }
  }
  return { candidates, scanned: scanTargets.length, warnings };
}

async function maybeAiSummary(
  c: OpportunityCandidate,
  user: UserProfile,
  kind: DiscoveryCandidateDto["candidateKind"],
  priceText?: string,
): Promise<string | undefined> {
  if (!process.env.LLM_API_KEY && !user.aiKeys) return undefined;
  try {
    const res = await runAi({
      action: "summarize",
      context: cleanText([c.title, c.description, c.rawContent].filter(Boolean).join("\n"), 6000),
      profile: profileText(user),
      extra: [
        "Skriv på dansk.",
        "Giv 2 korte, konkrete sætninger til en solo full-stack/software leverandør.",
        kind === "source"
          ? "Dette er en kildeside eller liste, ikke en enkelt opgave. Forklar værdien som kilde."
          : "Dette er en konkret mulig opgave/udbud. Nævn gerne frist, pris/budget og hvorfor den passer.",
        priceText ? `Pris/budget fundet: ${priceText}` : "",
      ].filter(Boolean).join(" "),
      aiKeys: user.aiKeys,
    });
    return res.mocked ? undefined : res.text;
  } catch {
    return undefined;
  }
}

async function toDiscoveryDto(
  c: OpportunityCandidate,
  user: UserProfile,
  meta: Pick<DiscoveryCandidateDto, "sourceName" | "sourceKind" | "provider" | "query">,
): Promise<DiscoveryCandidateDto> {
  const breakdown = scoreOpportunity(
    { ...c, contacts: c.contacts ?? [] },
    {
      budgetMaxDkk: user.budgetMaxDkk,
      weights: (user.scoringWeights as Partial<ScoreWeights>) || undefined,
    },
  );
  const fit = discoveryFitAdjustment(c);
  const adjustedTotal = Math.max(0, Math.min(100, breakdown.total + fit.delta));
  const adjustedBreakdown = { ...breakdown, total: adjustedTotal };
  const hash = dedupeHash(c);
  const detailText = cleanText(c.rawContent || c.description || "", 7000);
  const candidateKind = isSourceLikeCandidate(c, detailText) ? "source" : "opportunity";
  const priceText = extractPriceText(detailText);
  const aiSummary = await maybeAiSummary(c, user, candidateKind, priceText);
  const summaryDa = cleanText(aiSummary || buildDanishSummary(c, candidateKind, priceText), 900);
  const deadline = parseMaybeDate(c.deadline);
  const postedAt = parseMaybeDate(c.postedAt);
  return {
    id: hash,
    candidateKind,
    title: c.title,
    description: summaryDa || c.description,
    summaryDa,
    rawContent: c.rawContent,
    detailText,
    url: c.url,
    organization: c.organization,
    location: c.location,
    country: c.country,
    region: c.region,
    category: c.category,
    budgetMin: c.budgetMin,
    budgetMax: c.budgetMax,
    currency: c.currency ?? "DKK",
    priceText,
    deadline: deadline ? deadline.toISOString() : undefined,
    postedAt: postedAt ? postedAt.toISOString() : undefined,
    freshness: freshnessFor(c, candidateKind),
    applicationRoute: c.applicationRoute ?? "UNKNOWN",
    contacts: c.contacts ?? [],
    attachments: dedupeAttachments(c.attachments),
    matchScore: adjustedTotal,
    scoreBreakdown: adjustedBreakdown,
    reasons: [...fit.notes, ...reasonsFromScore(adjustedBreakdown)].slice(0, 5),
    signals: [...new Set([...signalLabels(c), ...fit.signals])].slice(0, 7),
    ...meta,
  };
}

function dedupeCandidates(candidates: DiscoveryCandidateDto[], maxResults: number): DiscoveryCandidateDto[] {
  const seen = new Set<string>();
  const unique: DiscoveryCandidateDto[] = [];
  for (const c of candidates.sort((a, b) => b.matchScore - a.matchScore)) {
    const key = c.url || c.id || c.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= maxResults) break;
  }
  return unique;
}

async function markAlreadySaved(ownerId: string, candidates: DiscoveryCandidateDto[]) {
  const hashes = candidates.map((c) => c.id).filter(Boolean);
  const urls = candidates.map((c) => c.url).filter(Boolean) as string[];
  if (!hashes.length && !urls.length) return candidates;

  const [saved, savedSources, feedbackRows] = await Promise.all([
    db.opportunity.findMany({
      where: {
        ownerId,
        OR: [
          hashes.length ? { dedupeHash: { in: hashes } } : undefined,
          urls.length ? { url: { in: urls } } : undefined,
        ].filter(Boolean) as Prisma.OpportunityWhereInput[],
      },
      select: { id: true, title: true, dedupeHash: true, url: true },
    }),
    urls.length
      ? db.source.findMany({
          where: { ownerId, url: { in: urls } },
          select: { id: true, name: true, url: true },
        })
      : Promise.resolve([]),
    hashes.length
      ? db.discoveryFeedback.findMany({
          where: { ownerId, candidateId: { in: hashes } },
          select: { candidateId: true, feedback: true },
        })
      : Promise.resolve([]),
  ]);
  return candidates.map((c) => {
    const match = saved.find((s) => s.dedupeHash === c.id || (c.url && s.url === c.url));
    const sourceMatch = savedSources.find((s) => c.url && s.url === c.url);
    const feedbackMatch = feedbackRows.find((f) => f.candidateId === c.id);
    return {
      ...c,
      ...(feedbackMatch ? { feedback: feedbackMatch.feedback } : {}),
      ...(match ? { alreadySaved: { id: match.id, title: match.title } } : {}),
      ...(sourceMatch ? { alreadySavedSource: { id: sourceMatch.id, name: sourceMatch.name } } : {}),
    };
  });
}

export async function runDiscoverySearch(
  ownerId: string,
  input: DiscoverySearchInput,
): Promise<DiscoverySearchResult> {
  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      headline: true,
      bio: true,
      preferredProjectTypes: true,
      excludedCategories: true,
      budgetMaxDkk: true,
      scoringWeights: true,
      aiKeys: true,
    },
  });
  if (!user) throw new Error("User not found");

  const workspace = input.workspace ?? "DK";
  const maxResults = Math.min(Math.max(input.maxResults ?? 12, 4), 30);
  const queries = buildQueries(input.query, workspace);
  const providerState = searchProviderFromEnv(input.provider, user.aiKeys);
  const warnings: string[] = [];
  let candidates: DiscoveryCandidateDto[] = [];
  let sourceScanCount = 0;

  if (input.includeWeb !== false && providerState.configured && providerState.provider !== "none") {
    try {
      const webResults = await runProviderSearch(
        providerState.provider,
        providerState.apiKey,
        queries,
        maxResults,
      );
      const webCandidates = await searchResultsToCandidates(webResults, user, workspace, maxResults);
      candidates.push(...webCandidates);
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : "Web search failed");
    }
  } else if (input.includeWeb !== false) {
    warnings.push(
      "No web search API key configured. Add Tavily, Brave Search, or Serper in Settings -> AI to enable broad web discovery.",
    );
  }

  if (input.includeSources !== false) {
    const scanned = await scanSources(ownerId, input.query, user, workspace, maxResults);
    sourceScanCount = scanned.scanned;
    candidates.push(...scanned.candidates);
    warnings.push(...scanned.warnings.slice(0, 4));
  }

  const resultKind = input.resultKind ?? "all";
  const beforeKindFilter = candidates.length;
  const kindCandidates = candidates.filter((candidate) => {
    if (resultKind === "opportunities") return candidate.candidateKind === "opportunity";
    if (resultKind === "sources") return candidate.candidateKind === "source";
    return true;
  });
  const kindHiddenCount = beforeKindFilter - kindCandidates.length;
  if (kindHiddenCount > 0 && resultKind !== "all") {
    warnings.push(
      `${kindHiddenCount} ${resultKind === "opportunities" ? "source" : "opportunity"} candidates were hidden by the result filter.`,
    );
  }

  const beforeFreshnessFilter = kindCandidates.length;
  const freshCandidates = kindCandidates.filter(
    (candidate) =>
      candidate.candidateKind === "source" ||
      candidate.freshness === "active" ||
      candidate.freshness === "unknown",
  );
  const hiddenCount = beforeFreshnessFilter - freshCandidates.length;
  if (hiddenCount > 0) {
    warnings.push(`${hiddenCount} expired or stale candidates were hidden from the review list.`);
  }

  const marked = await markAlreadySaved(ownerId, dedupeCandidates(freshCandidates, maxResults));
  const unique = marked.filter((candidate) => candidate.feedback !== "NON_LEAD");
  return {
    candidates: unique,
    queries,
    provider: providerState.provider,
    providerConfigured: providerState.configured,
    sourceScanCount,
    warnings,
  };
}

function sourceTypeForCandidate(candidate: DiscoveryCandidateSaveInput): SourceType {
  const text = `${candidate.title} ${candidate.url ?? ""} ${candidate.description ?? ""} ${candidate.rawContent ?? ""}`.toLowerCase();
  return /udbud|tender|procurement|indkøb|indkoeb|tilbud|herkules|ehsys/.test(text)
    ? "PROCUREMENT"
    : "PUBLIC_WEB";
}

function parserKeyForSource(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host.endsWith("ehsys.dk") && /\/indkoeb\/alle\/?$|\/indkøb\/alle\/?$/.test(path)) {
      return "ehsys-procurement";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function sourceKeywordsFromCandidate(candidate: DiscoveryCandidateSaveInput, workspace: Workspace): string[] {
  const seed = [
    ...(candidate.signals ?? []),
    candidate.category,
    candidate.query,
    workspace === "DK" ? "software udbud digitalisering teknisk mvp ai" : "software tender mvp ai",
  ].filter(Boolean).join(" ");
  const blocked = new Set(["site", "https", "http", "www", "com", "dk", "the", "and", "eller", "med"]);
  const words = seed
    .toLowerCase()
    .split(/[^a-z0-9æøå]+/i)
    .map((word) => word.trim())
    .filter((word) => word && (word.length >= 3 || word === "ai") && !blocked.has(word));
  return [...new Set(words)].slice(0, 14);
}

function feedbackCandidateId(candidate: DiscoveryCandidateSaveInput): string {
  if (candidate.id) return candidate.id;
  const base = enrichCandidate({
    title: candidate.title,
    description: candidate.summaryDa || candidate.description,
    rawContent: candidate.detailText || candidate.rawContent,
    url: candidate.url,
    organization: candidate.organization || candidate.sourceName,
  });
  return dedupeHash(base);
}

export async function saveDiscoveryFeedback(
  ownerId: string,
  candidate: DiscoveryCandidateSaveInput,
  feedback: "GOOD_RESULT" | "NON_LEAD",
  reason?: string,
) {
  const candidateId = feedbackCandidateId(candidate);
  const saved = await db.discoveryFeedback.upsert({
    where: { ownerId_candidateId: { ownerId, candidateId } },
    update: {
      feedback,
      reason,
      title: cleanText(candidate.title, 220) || "Untitled result",
      url: candidate.url || null,
      candidateKind: candidate.candidateKind,
      sourceName: candidate.sourceName,
      provider: candidate.provider,
      query: candidate.query,
    },
    create: {
      ownerId,
      candidateId,
      feedback,
      reason,
      title: cleanText(candidate.title, 220) || "Untitled result",
      url: candidate.url || null,
      candidateKind: candidate.candidateKind,
      sourceName: candidate.sourceName,
      provider: candidate.provider,
      query: candidate.query,
    },
    select: { id: true, candidateId: true, feedback: true },
  });
  return { feedback: saved };
}

export async function saveDiscoverySource(
  ownerId: string,
  candidate: DiscoveryCandidateSaveInput,
  workspace: Workspace,
) {
  if (!candidate.url) throw new Error("A source URL is required");
  const url = candidate.url;
  await assertPublicUrl(url);

  const existing = await db.source.findFirst({
    where: { ownerId, url },
    include: { _count: { select: { opportunities: true } } },
  });
  if (existing) return { source: existing, created: false };

  const type = sourceTypeForCandidate(candidate);
  const source = await db.source.create({
    data: {
      ownerId,
      name: cleanText(candidate.title || candidate.sourceName || sourceLabel(url), 160),
      url,
      type,
      workspace,
      frequency: type === "PROCUREMENT" ? "DAILY" : "WEEKLY",
      keywords: sourceKeywordsFromCandidate(candidate, workspace),
      country: candidate.country || (workspace === "DK" ? "DK" : undefined),
      region: candidate.region,
      category: candidate.category || (type === "PROCUREMENT" ? "Tender" : undefined),
      enabled: true,
      parserKey: parserKeyForSource(url),
      notes: cleanText(
        [
          candidate.summaryDa || candidate.description,
          candidate.priceText ? `Prisinfo fundet: ${candidate.priceText}` : "",
          candidate.sourceName ? `Fundet via ${candidate.sourceName}.` : "",
          candidate.query ? `Discovery query: ${candidate.query}` : "",
        ].filter(Boolean).join("\n"),
        1600,
      ),
    },
    include: { _count: { select: { opportunities: true } } },
  });

  return { source, created: true };
}

export async function saveDiscoveryCandidate(
  ownerId: string,
  candidate: DiscoveryCandidateSaveInput,
  workspace: Workspace,
) {
  const base: OpportunityCandidate = enrichCandidate({
    title: candidate.title,
    description: candidate.summaryDa || candidate.description,
    rawContent: candidate.detailText || candidate.rawContent,
    url: candidate.url,
    organization: candidate.organization || candidate.sourceName,
    location: candidate.location,
    country: candidate.country || (workspace === "DK" ? "DK" : undefined),
    region: candidate.region,
    category: candidate.category,
    budgetMin: candidate.budgetMin,
    budgetMax: candidate.budgetMax,
    currency: candidate.currency || "DKK",
    deadline: parseMaybeDate(candidate.deadline),
    postedAt: parseMaybeDate(candidate.postedAt),
    applicationRoute: candidate.applicationRoute,
    contacts: candidate.contacts,
    attachments: candidate.attachments,
  });
  const hash = dedupeHash(base);

  const existing = await db.opportunity.findFirst({
    where: {
      ownerId,
      OR: [{ dedupeHash: hash }, ...(base.url ? [{ url: base.url }] : [])],
    },
    select: { id: true, title: true },
  });
  if (existing) {
    await saveDiscoveryFeedback(ownerId, candidate, "GOOD_RESULT");
    return { opportunity: existing, created: false };
  }

  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: { budgetMaxDkk: true, scoringWeights: true },
  });
  const breakdown = scoreOpportunity(
    { ...base, contacts: base.contacts ?? [] },
    {
      budgetMaxDkk: user?.budgetMaxDkk ?? 100000,
      weights: (user?.scoringWeights as Partial<ScoreWeights>) || undefined,
    },
  );
  breakdown.computedAt = new Date().toISOString();
  const isActive = !base.deadline || new Date(base.deadline).getTime() >= Date.now();

  const opportunity = await db.opportunity.create({
    data: {
      ownerId,
      title: base.title,
      description: base.description,
      rawContent: base.rawContent,
      url: base.url,
      organization: base.organization,
      location: base.location,
      country: base.country || (workspace === "DK" ? "DK" : undefined),
      region: base.region,
      category: base.category,
      workspace,
      budgetMin: base.budgetMin,
      budgetMax: base.budgetMax,
      currency: base.currency ?? "DKK",
      deadline: base.deadline ?? undefined,
      postedAt: base.postedAt ?? undefined,
      isActive,
      applicationRoute: base.applicationRoute ?? "UNKNOWN",
      ingestMethod: "AUTOMATED",
      matchScore: breakdown.total,
      scoreBreakdown: breakdown as object,
      aiSummary: candidate.summaryDa || candidate.description,
      whyRelevant: candidate.priceText,
      dedupeHash: hash,
      status: "NEW",
      contacts: base.contacts?.length
        ? {
            create: base.contacts.map((contact) => ({
              name: contact.name,
              email: contact.email,
              role: contact.role,
            })),
          }
        : undefined,
      attachments: base.attachments?.length
        ? {
            create: dedupeAttachments(base.attachments).map((attachment) => ({
              label: attachment.label,
              url: attachment.url,
              kind: attachment.kind,
            })),
          }
        : undefined,
      activities: {
        create: {
          type: "IMPORT",
          message: "Saved from Discover",
          metadata: {
            sourceName: candidate.sourceName ?? "Discover",
            sourceKind: candidate.sourceKind ?? "web-search",
            provider: candidate.provider ?? "discover",
            query: candidate.query ?? "",
            candidateKind: candidate.candidateKind ?? "opportunity",
            freshness: candidate.freshness ?? "unknown",
            attachments: candidate.attachments?.length ?? 0,
          },
        },
      },
    },
    select: { id: true, title: true },
  });

  await ensureEmbedding(opportunity.id);
  await saveDiscoveryFeedback(ownerId, candidate, "GOOD_RESULT");

  if (breakdown.total >= 80) {
    await db.alert.create({
      data: {
        ownerId,
        type: "NEW_HIGH_MATCH",
        title: `New high-match lead: ${opportunity.title}`,
        body: `Score ${breakdown.total}. ${base.url ?? ""}`,
        payload: { opportunityId: opportunity.id, score: breakdown.total },
      },
    });
  }

  return { opportunity, created: true };
}
